import { AsyncHandler } from "../utils/AsyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { cloudinary } from "../utils/uploadToCloudinary.js";
import { Users } from "../models/users.model.js";
import fs from "fs/promises";
import mongoose from "mongoose";

const uploadImageOnCloudinary = (filePath) => {
  return cloudinary.uploader.upload(filePath,
      {
        resource_type: "image", 
        folder: "images",
      }
  );
}

const deleteImageFromLocal = async (filePath) => {
  try {
    await fs.unlink(filePath);
    console.log("Image deleted from Local Storage:");
  } catch (error) {
    console.log("Error deleting image from Local Storage: ", error);
  }
};

const getCurrentUser = AsyncHandler(async(req, res) => {
  
  const user = req.user;
  if(!user)      throw new ApiError(401, "Unauthorized!");
  res.status(200).json(new ApiResponse(200, "User fetch successfully", user));
});

const updateProfileImage = AsyncHandler(async (req, res) => {
  
  const profileImageLocalPath = req.file?.path;

  if(!profileImageLocalPath)         throw new ApiError(400, "Profile image local path not found!")

  const profileImage = await uploadImageOnCloudinary(profileImageLocalPath);

  deleteImageFromLocal(profileImageLocalPath);

  const user = await Users.findById(req.user._id);

  if(user.profileimageid){
     const result = await cloudinary.uploader.destroy(user.profileimageid);
     if(result === "ok")        console.log("previous profile image deleted from cloudinary");
  }

  const newprofileuser = await Users.findByIdAndUpdate(
    user._id,
    { 
      $set: { 
        profileimage: profileImage.secure_url,
        profileimageid: profileImage.public_id
      }
    },
    { new: true }
  ).select("-password -refreshtoken");

  res
    .status(200)
    .json(new ApiResponse(200, "Profile Image Updated Successfully", newprofileuser));
});

const updateCoverImage = AsyncHandler(async (req, res) => {

  const coverImageLocalPath = req.file?.path;

  if(!coverImageLocalPath)         throw new ApiError(400, "Cover image local path not found!")

  const coverImage = await uploadImageOnCloudinary(coverImageLocalPath);

  deleteImageFromLocal(coverImageLocalPath);

  const user = await Users.findById(req.user._id);

  if(user.coverimageid){
    const result = await cloudinary.uploader.destroy(user.coverimageid);
    if(result !== "ok")          console.log("previous cover image deleted from cloudinary");
  }

  const newcoveruser = await Users.findByIdAndUpdate(
    user._id,
    { 
      $set:
       { 
        coverimage: coverImage.secure_url,
        coverimageid: coverImage.public_id,
       }
    },
    { new: true }
  ).select("-password -refreshtoken");

  res
    .status(200)
    .json(new ApiResponse(200, "Cover Image Updated Successfully", newcoveruser));
});

const getUserChannelProfile = AsyncHandler(async (req, res) => {

  const {username} = req.params;

  if(!username?.trim())        throw new ApiError(400, "username is required!");

  const channel = await Users.aggregate([
    {
      $match: { username: username?.trim()?.toLowerCase()}
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers"
      }
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedChannels"
      }
    },
    {
      $addFields: {
        subscriberCount : { $size: "$subscribers"},
        subscribedChannelsCount: { $size: "$subscribedChannels"},
        isSubscribed: {
          $cond: {
            if: { $in: [new mongoose.Types.ObjectId(req.user?._id), "$subscribers.subscriber"] },
            then: true,
            else: false
          }
        }
      }
    },
    {
      $project: {
        fullname: 1,
        username: 1,
        coverimage: 1,
        profileimage: 1,
        subscriberCount: 1,
        subscribedChannelsCount: 1,
        isSubscribed: 1
      }
    } 
  ])
  
  if(!channel.length)          throw new ApiError(404, "channel not found!");
  
  res.status(200).json(new ApiResponse(200, "Channel profile fetch successfully", channel[0]));
})

const userWatchHistory = AsyncHandler(async (req, res) => {

  const user = await Users.aggregate([
    {
      $match: { _id: new mongoose.Types.ObjectId(req.user._id) }
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                { 
                  $project: {
                    username: 1
                  }
                }
              ]
            }
          },
          {
            $addFields : {
              owner: { $arrayElemAt: ["$owner", 0] }
            }
          },
          {
            $project: {
              videofile: 1,
              thumbnail: 1,
              title: 1,
              duration: 1,
              views: 1,
              videoId: 1,
              slug: 1,
              owner: 1,
              createdAt: 1,
            }
          }
        ]
      }
    },
    {
      $project: {
        watchHistory: 1
      }
    }
  ])

  res.status(200).json(new ApiResponse(200, "User watch history fetch successfully", user[0]))
})

const getUserVideos = AsyncHandler(async (req, res) => {

  const { username} = req.params;

  if(!username?.trim())           throw new ApiError(400, "Username is required!");

  const userVideos = await Users.aggregate([
    {   
      $match: { username: username?.trim()?.toLowerCase() }
    },
    {
      $lookup: {
        from: "videos",
        localField: "myVideos",
        foreignField: "_id",
        as: "myVideos",
        pipeline: [
          {
            $project: {
              videofile: 1,
              thumbnail: 1,
              title: 1,
              duration: 1,
              views: 1,
              description: 1,
              createdAt: 1
            }
          }
        ]
      }
    },
    {
      $project: {
        myVideos: 1 
      }
    }
  ])

  if(!userVideos)                   throw new ApiError(400, "User not found!");

  res.status(200).json(new ApiResponse(200, "Successfully fetched user videos", userVideos));
})


export {
  updateProfileImage,
  updateCoverImage,
  getUserChannelProfile,
  userWatchHistory,
  getUserVideos,
  getCurrentUser
};
