import { AsyncHandler } from "../utils/AsyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { cloudinary } from "../utils/uploadToCloudinary.js";
import { Users } from "../models/users.model.js";
import fs from "fs/promises";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const options = {
  httpOnly: true,
  secure: false,
};

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

const generateRefreshAccessToken = async (user) => {
  let accessToken, refreshToken;

  try {
    accessToken = user.accessToken();
    refreshToken = user.refreshToken();
  } catch (error) {
    console.log(error);
    throw new ApiError(400, "Error generating tokens");
  }

  user.refreshtoken = refreshToken;
  await user.save();
  return { accessToken, refreshToken };
};

const userRegister = AsyncHandler(async (req, res) => {
  const { username, fullname, email, password } = req.body;

  if (!username || !fullname || !email || !password)
    throw new ApiError(400, "All field are required!");

  const user = await Users.findOne({
    $or: [{ username }, { email }],
  });

  if (user) throw new ApiError(400, "username or email is already registered");

  let profileImagePath = req.files?.profileimage?.[0].path;
  let coverImagePath = req.files?.coverimage?.[0].path;
  let profileimage;
  let coverimage;

  if (profileImagePath) {
    profileimage = await uploadImageOnCloudinary(profileImagePath);
    deleteImageFromLocal(profileImagePath);
  }

  if (coverImagePath) {
    coverimage = await uploadImageOnCloudinary(coverImagePath);
    deleteImageFromLocal(coverImagePath);
  }

  const registerUser = await Users.create({
    username,
    fullname,
    email,
    password,
    profileimage: profileimage?.secure_url || "",
    profileimageid: profileimage?.public_id || "",
    coverimage: coverimage?.secure_url || "",
    coverimageid: coverimage?.public_id || "",
  });

  const registeredUser = await Users.findById(registerUser._id).select(
    "-password -refreshtoken"
  );

  res
    .status(200)
    .json(new ApiResponse(200, "User Register Successfully", registeredUser));
});

const userLogin = AsyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  if (!username && !email)
    throw new ApiError(400, "Must required email or username!");

  if (!password) throw new ApiError(400, "Must required password!");

  const user = await Users.findOne({
    $or: [{ email }, { username }],
  });

  if (!user) throw new ApiError(400, "Invalid Email or Username");

  if (!user.isPasswordCorrect(password))
    throw new ApiError(400, "Invalid password");

  const { accessToken, refreshToken } = await generateRefreshAccessToken(user);

  const loginUser = await Users.findById(user._id).select(
    "-password -refreshtoken"
  );

  res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(200, "Successfully login", {
        loginUser,
        accessToken,
        refreshToken,
      })
    );
});

const userLogout = AsyncHandler(async (req, res) => {
  if (!req.user) throw new ApiError(400, "Unauthorized");

  const user = req.user;

  const logoutUser = await Users.findByIdAndUpdate(
    user._id,
    { $set: { refreshtoken: undefined } },
    { new: true }
  ).select("-password -refreshtoken");

  res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, "Successfully logged out", logoutUser));
});

const refreshAccessToken = AsyncHandler(async (req, res) => {
  const oldRefreshToken =
    req.cookies?.refreshToken ||
    req.header["Authorization"]?.replace("Bearer ", "");

  if (!oldRefreshToken) throw new ApiError(400, "Please send RefreshToken!");

  let decodedToken;
  try {
    decodedToken = jwt.verify(
      oldRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new ApiError(401, "Refresh token expired");
    }
    throw new ApiError(401, "Invalid refresh token");
  }

  const user = await Users.findById(decodedToken.id);

  const { accessToken, refreshToken } = await generateRefreshAccessToken(user);

  console.log(accessToken, refreshToken);

  const newUser = await Users.findById(user._id).select(
    "-password -refreshtoken"
  );

  res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(200, "RefreshAccessToken Successfully", {
        newUser,
        accessToken,
        refreshToken,
      })
    );
});

const updateProfileImage = AsyncHandler(async (req, res) => {
  
  const profileImageLocalPath = req.file?.path;

  const profileImage = await uploadImageOnCloudinary(profileImageLocalPath);

  deleteImageFromLocal(profileImageLocalPath);

  const user = await Users.findById(req.user._id);

  const result = await cloudinary.uploader.destroy(user.profileimageid);

  if(result === "ok")        console.log("previous profile image deleted from cloudinary");

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

  const coverImageLocalPath = req.file.path;

  const coverImage = await uploadImageOnCloudinary(coverImageLocalPath);

  deleteImageFromLocal(coverImageLocalPath);

  const user = await Users.findById(req.user._id);

  const result = await cloudinary.uploader.destroy(user.coverimageid);

  if(result !== "ok")          console.log("previous cover image deleted from cloudinary");

  const newcoveruser = await Users.findByIdAndUpdate(
    req.user._id,
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
        subscriberCount : { $size: "$subscriber"},
        subscribedChannelsCount: { $size: "$subscribedChannels"},
        isSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
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
              owner: 1,
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
  userRegister,
  userLogin,
  userLogout,
  refreshAccessToken,
  updateProfileImage,
  updateCoverImage,
  getUserChannelProfile,
  userWatchHistory,
  getUserVideos,
};
