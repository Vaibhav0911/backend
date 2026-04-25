import { Users } from "../models/users.model.js";
import { Videos } from "../models/videos.model.js";
import { Views } from "../models/views.model.js";
import { Subscriptions } from "../models/subscriptions.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { AsyncHandler } from "../utils/AsyncHandler.js";
import { cloudinary } from "../utils/uploadToCloudinary.js";
import fs from "fs/promises";

const uploadFileOnCloudinary = (localFilePath, fileType, folder) => {
  return cloudinary.uploader.upload(localFilePath, {
    resource_type: fileType,
    folder: folder,
  });
};

const deleteFileFromLocal = async (filePath) => {
  try {
    await fs.unlink(filePath);
    console.log("File deleted from Local Storage:");
  } catch (error) {
    console.log("Error deleting File from Local Storage: ", error);
  }
};

const uploadVideo = AsyncHandler(async (req, res) => {
  if (!req.user) throw new ApiError(400, "Unauthorized");

  const { title, description, isPublised } = req.body;

  if (!title || !description || !isPublised)
    throw new ApiError(400, "title, description and isPublised is required!");

  const localVideoFilePath = req.files?.videofile?.[0]?.path || "";
  const localThumbnailPath = req.files?.thumbnail?.[0]?.path || "";

  // console.log(req.files);

  if (!localVideoFilePath)
    throw new ApiError(400, "Videofile local path not found!");
  if (!localThumbnailPath)
    throw new ApiError(400, "Thumbnail local path not found!");

  const VideoFile = await uploadFileOnCloudinary(
    localVideoFilePath,
    "video",
    "videos"
  );

  const Thumbnail = await uploadFileOnCloudinary(
    localThumbnailPath,
    "image",
    "thumbnails"
  );

  // console.log(VideoFile);
  // console.log(Thumbnail);

  deleteFileFromLocal(localVideoFilePath);
  deleteFileFromLocal(localThumbnailPath);

  const video = await Videos.create({
    videofile: VideoFile.secure_url,
    videofileId: VideoFile.public_id,
    thumbnail: Thumbnail.secure_url,
    thumbnailId: Thumbnail.public_id,
    title,
    description,
    duration: VideoFile.duration,
    isPublised: isPublised === "true",
    owner: req.user?._id,
  });

  const user = await Users.findByIdAndUpdate(
    req.user?._id,
    {
      $push: { myVideos: video._id },
    },
    { new: true }
  );

  res
    .status(200)
    .json(new ApiResponse(200, "Video uploaded successfully", { video, user }));
});

const getVideo = AsyncHandler(async (req, res) => {
  const { videoId, slug } = req.params;

  if (!videoId?.trim()) {
    throw new ApiError(400, "VideoId not Found!");
  }

  const video = await Videos.findById(videoId)
    .populate("owner", "username fullname profileimage")
    .lean();

  if (!video) {
    throw new ApiError(404, "Video not Found!");
  }

  if (slug !== video.slug) {
    return res.redirect(301, `/api/v1/videos/${video._id}/${video.slug}`);
  }

  if (req.user) {
    const view = await Views.findOne({
      video: video._id,
      user: req.user._id,
    }).lean();

    if (!view) {
      await Promise.all([
        Views.create({
          video: video._id,
          user: req.user._id,
        }),
        Videos.findByIdAndUpdate(video._id, {
          $inc: { views: 1 },
        }),
      ]);

      video.views += 1;
    }

    await Users.findByIdAndUpdate(
      req.user._id,
      [
        {
          $set: {
            watchHistory: {
              $slice: [
                {
                  $concatArrays: [
                    [video._id],
                    {
                      $filter: {
                        input: "$watchHistory",
                        cond: { $ne: ["$$this", video._id] },
                      },
                    },
                  ],
                },
                50,
              ],
            },
          },
        },
      ],
      {
        updatePipeline: true,
      }
    );
  }

  const [subscribersCount, isSubscribed] = await Promise.all([
    Subscriptions.countDocuments({
      channel: video.owner._id,
    }),

    req.user
      ? Subscriptions.exists({
          channel: video.owner._id,
          subscriber: req.user._id,
        })
      : false,
  ]);

  const responseVideo = {
    ...video,
    owner: {
      ...video.owner,
      subscribersCount,
      isSubscribed: Boolean(isSubscribed),
    },
  };

  return res
    .status(200)
    .json(new ApiResponse(200, "Successfully get video", responseVideo));
});

const getAllVideos = AsyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.max(Number(req.query.limit) || 10, 1);
  const skip = (page - 1) * limit;

  const result = await Videos.aggregate([
    {
      $match: { isPublised: true },
    },
    {
      $sort: { createdAt: -1, _id: -1 },
    },
    {
      $facet: {
        totalCount: [{ $count: "count" }],
        videos: [
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    profileimage: 1,
                    username: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: { $arrayElemAt: ["$owner", 0] },
            },
          },
          {
            $project: {
              thumbnail: 1,
              videofile: 1,
              slug: 1,
              title: 1,
              duration: 1,
              views: 1,
              owner: 1,
            },
          },
        ],
      },
    },
  ]);

  const totalVideos = result[0].totalCount[0]?.count || 0;
  const videos = result[0].videos;
  const totalPages = Math.ceil(totalVideos / limit);

  res.status(200).json(
    new ApiResponse(200, "Successfully fetch all videos", {
      page,
      limit,
      totalVideos,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      videos,
    })
  );
});

const updateVideo = AsyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!videoId) throw new ApiError(400, "videoId not found!");
  if (!req.user) throw new ApiError(400, "Unauthorized");

  // console.log(req.headers);

  const { title, description, isPublised } = req.body;

  if (!title || !description || !isPublised)
    throw new ApiError(400, "title, description, isPublised field not found!");

  const video = await Videos.findById(videoId);

  if (!video) throw new ApiError(400, "Video not Found!");

  const localThumbnailPath = req.file?.path;
  let thumbnail;

  if (localThumbnailPath) {
    thumbnail = await uploadFileOnCloudinary(
      localThumbnailPath,
      "image",
      "thumbnails"
    );
    deleteFileFromLocal(localThumbnailPath);

    const result = await cloudinary.uploader.destroy(video.thumbnailId);

    if (result.result === "ok")
      console.log("previous thumbnail deleted from cloudinary");
  }

  const updatedVideo = await Videos.findByIdAndUpdate(
    video._id,
    {
      $set: {
        thumbnail: thumbnail?.secure_url || video.thumbnail,
        thumbnailId: thumbnail?.public_id || video.thumbnailId,
        title,
        description,
        isPublised,
      },
    },
    { new: true }
  );

  res
    .status(200)
    .json(
      new ApiResponse(200, "Video details updated successfully", updatedVideo)
    );
});

const deleteVideo = AsyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!req.user) throw new ApiError(400, "Unauthorized");

  const video = await Videos.findById(videoId);

  if (!video) throw new ApiError(400, "Video not Found!");

  const thumbnailResult = await cloudinary.uploader.destroy(video.thumbnailId);

  const videoResult = await cloudinary.uploader.destroy(video.videofileId, {
    resource_type: "video",
  });

  // if(thumbnailResult == "ok")       console.log("thumbnail deleted from cloudinary");

  // if(videoResult == "ok")           console.log("video deleted from cloudinary");

  await Videos.findByIdAndDelete(videoId);

  res.status(200).json(new ApiResponse(200, "Video deleted successfully"));
});

export { uploadVideo, getVideo, updateVideo, deleteVideo, getAllVideos };
