import { Users } from "../models/users.model.js";
import { Subscriptions } from "../models/subscriptions.model.js";
import { AsyncHandler } from "../utils/AsyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Videos } from "../models/videos.model.js";

const toggleSubscribeChannel = AsyncHandler(async (req, res) => {
  const { username } = req.params;
  const user = req.user;

  if (!username)     throw new ApiError(400, "username not found!");
  if (!user)         throw new ApiError(400, "Unauthorized!");

  const channel = await Users.findOne({ username });

  if (!channel) throw new ApiError(400, "Channel not found!");

  if (channel.username === user.username)
    throw new ApiError(400, "User cannot subscribe himself!");

  const isSubscribe = await Subscriptions.findOneAndDelete({
    subscriber: user._id,
    channel: channel._id,
  });

  if (isSubscribe)
    return res
      .status(200)
      .json(
        new ApiResponse(200, "UnSubscribe channel successfully", isSubscribe)
      );

  const subscribe = await Subscriptions.create({
    subscriber: user._id,
    channel: channel._id,
  });

  res
    .status(200)
    .json(new ApiResponse(200, "Subscribe channel successfully!", subscribe));
});

const getMySubscribedChannels = AsyncHandler(async (req, res) => {
  const user = req.user;

  if (!user) {
    throw new ApiError(401, "Unauthorized!");
  }

  const subscribedChannels = await Subscriptions.aggregate([
    {
      $match: {
        subscriber: user._id,
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "channel",
        foreignField: "_id",
        as: "channel",
        pipeline: [
          {
            $project: {
              username: 1,
              fullname: 1,
              profileimage: 1,
              coverimage: 1,
              email: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        channel: {
          $arrayElemAt: ["$channel", 0],
        },
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "channel._id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $addFields: {
        "channel.subscribersCount": {
          $size: "$subscribers",
        },
      },
    },
    {
      $replaceRoot: {
        newRoot: "$channel",
      },
    },
    {
      $sort: {
        username: 1,
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        "Subscribed channels fetched successfully",
        subscribedChannels
      )
    );
});

const getVideosFromSubscribedChannels = AsyncHandler(async (req, res) => {
  const user = req.user;

  if (!user) {
    throw new ApiError(401, "Unauthorized!");
  }

  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 12;
  const skip = (page - 1) * limit;

  const subscribedChannels = await Subscriptions.find({
    subscriber: user._id,
  }).select("channel");

  const channelIds = subscribedChannels.map((sub) => sub.channel);

  if (!channelIds.length) {
    return res.status(200).json(
      new ApiResponse(200, "No subscribed channel videos found", {
        videos: [],
        totalVideos: 0,
        currentPage: page,
        totalPages: 0,
      })
    );
  }

  const videos = await Videos.aggregate([
    {
      $match: {
        owner: {
          $in: channelIds,
        },
        isPublised: true,
      },
    },
    {
      $sort: {
        createdAt: -1,
      },
    },
    {
      $facet: {
        metadata: [
          {
            $count: "totalVideos",
          },
        ],
        videos: [
          {
            $skip: skip,
          },
          {
            $limit: limit,
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
                    username: 1,
                    fullname: 1,
                    profileimage: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: {
                $arrayElemAt: ["$owner", 0],
              },
            },
          },
          {
            $project: {
              title: 1,
              description: 1,
              thumbnail: 1,
              videofile: 1,
              duration: 1,
              views: 1,
              videoId: 1,
              slug: 1,
              owner: 1,
              createdAt: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        totalVideos: {
          $ifNull: [
            {
              $arrayElemAt: ["$metadata.totalVideos", 0],
            },
            0,
          ],
        },
      },
    },
    {
      $project: {
        metadata: 0,
      },
    },
  ]);

  const result = videos[0];

  return res.status(200).json(
    new ApiResponse(200, "Subscribed channel videos fetched successfully", {
      videos: result.videos,
      totalVideos: result.totalVideos,
      currentPage: page,
      totalPages: Math.ceil(result.totalVideos / limit),
    })
  );
});

export { toggleSubscribeChannel, getMySubscribedChannels, getVideosFromSubscribedChannels };
