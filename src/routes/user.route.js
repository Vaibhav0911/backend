import { Router } from "express";
import { Upload } from "../middlewares/upload.middleware.js";
import { jwtverify } from "../middlewares/auth.middleware.js";
import { optionalAuth } from "../middlewares/optionalAuth.middleware.js";
import { 
  updateProfileImage,
  updateCoverImage,
  getUserChannelProfile,
  userWatchHistory,
  getUserVideos,
  getCurrentUser
} from "../controllers/user.controller.js";

const router = Router();

// secure routes

router.route("/current-user").get(
  jwtverify,
  getCurrentUser
)

router.route("/update-profile-image").patch(
  jwtverify,
  Upload.single("profileimage"),
  updateProfileImage
)

router.route("/update-cover-image").patch(
  jwtverify,
  Upload.single("coverimage"),
  updateCoverImage
)

router.route("/channel-profile/:username").get(
  optionalAuth,
  getUserChannelProfile
)

router.route("/watch-history").get(
  jwtverify,
  userWatchHistory
)

router.route("/:username/videos").get(
  getUserVideos
)

export default router;
