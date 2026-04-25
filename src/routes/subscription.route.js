import { Router } from "express";
import { jwtverify } from "../middlewares/auth.middleware.js";
import {
  toggleSubscribeChannel,
  getMySubscribedChannels,
  getVideosFromSubscribedChannels
} from "../controllers/subscription.controller.js";

const router = Router();

router.route("/users/:username").post(
    jwtverify,
    toggleSubscribeChannel
)

router.route("/my-subscriptions").get(
  jwtverify,
  getMySubscribedChannels
)

router.route("/feed/videos").get(
  jwtverify,
  getVideosFromSubscribedChannels
)

export default router;