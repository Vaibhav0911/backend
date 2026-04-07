import { Users } from "../models/users.model.js";
import { Videos } from "../models/videos.model.js";
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

  if (!title || !description)
    throw new ApiError(400, "title and description is required!");

  const localVideoFilePath = req.files?.videofile?.[0]?.path || "";
  const localThumbnailPath = req.files?.thumbnail?.[0]?.path || "";

  // console.log(req.files);

  if (!localVideoFilePath) throw new ApiError(400, "No videofile uploaded");
  if (!localThumbnailPath) throw new ApiError(400, "No Thumbnail uploaded");

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
  if (!req.user) throw new ApiError(400, "Unauthorized");

  const { videoId, slug } = req.params;

  if (!videoId?.trim())    throw new ApiError(400, "VideoId not Found!");

  const video = await Videos.findOne({ videoId });

  if (!video) throw new ApiError(400, "Video not Found!");

  if (slug !== video.slug) {
    return res.redirect(301, `/api/v1/video/${video.videoId}/${video.slug}`);
  }

  await Videos.findByIdAndUpdate(
    video._id,
    { $inc: { views: 1 } },
    { new: true }
  );

  await Users.findByIdAndUpdate(
    req.user._id,
    { 
      $push: { watchHistory: video._id},
    },
    {new: true}
  );

  const userVideo = await Videos.aggregate([
    {
      $match: { videoId: videoId?.trim() }
    },
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
              username: 1
            }
          },
        ]
      }
    },
    {
      $addFields: {
        owner: { $arrayElemAt: ["$owner", 0] }
      }
    },
    {
      $project: {
        thumbnail: 1,
        videofile: 1,
        title: 1,
        duration: 1,
        views: 1,
        owner: 1
      }
    }
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, "Successfully get video", userVideo[0]));
});

const getAllVideos = AsyncHandler(async (req, res) => {
  if(!req.user)        throw new ApiError(400, "Unauthorize");

  const videos = await Videos.aggregate([
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
            }
          }
        ] 
      }
    },
    {
      $addFields: {
        owner: { $arrayElemAt: ["$owner", 0] }
      }
    },
    {
      $project: {
        thumbnail: 1,
        videofile: 1,
        videoId: 1,
        title: 1,
        duration: 1,
        views: 1,
        owner: 1
      }
    }
  ]);

  res.status(200).json(new ApiResponse(200, "Successfully fetch all videos", videos));
})

const updateVideo = AsyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!req.user) throw new ApiError(400, "Unauthorized");
  
  // console.log(req.headers);
  
  const { title, description, isPublised } = req.body;

  if (!title || !description)
    throw new ApiError(400, "title and description is required!");

  const localThumbnailPath = req.file?.path;

  if (!localThumbnailPath) throw new ApiError("Thumbnail is required!");

  const video = await Videos.findOne({ videoId });

  if (!video) throw new ApiError(400, "Video not Found!");

  const thumbnail = await uploadFileOnCloudinary(
    localThumbnailPath,
    "image",
    "thumbnails"
  );

  deleteFileFromLocal(localThumbnailPath);

  const result = await cloudinary.uploader.destroy(video.thumbnailId);

  if (result === "ok")
    console.log("previous thumbnail deleted from cloudinary");

  const updatedVideo = await Videos.findByIdAndUpdate(
    video._id,
    {
      $set: {
        thumbnail: thumbnail.secure_url,
        thumbnailId: thumbnail.public_id,
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

  const video = await Videos.findOne({ videoId });
  
  const thumbnailResult = await cloudinary.uploader.destroy(video.thumbnailId);

  const videoResult = await cloudinary.uploader.destroy(video.videoId, {
    resource_type: "video",
  });

  // if(thumbnailResult == "ok")       console.log("thumbnail deleted from cloudinary");

  // if(videoResult == "ok")           console.log("video deleted from cloudinary");

  await Videos.deleteOne({ videoId });

  res.status(200).json(new ApiResponse(200, "Video deleted successfully"));
});

export { uploadVideo, getVideo, updateVideo, deleteVideo, getAllVideos };
