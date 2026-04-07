import { Router } from "express";
import { jwtverify } from "../middlewares/auth.middleware.js";
import { Upload } from "../middlewares/upload.middleware.js";
import { uploadVideo, getVideo, updateVideo, deleteVideo, getAllVideos } from "../controllers/video.controller.js";

const router = Router();

router.route("/upload-video").post(
  jwtverify,
  Upload.fields([
    { name: "videofile", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  uploadVideo
);

router.route("/:videoId/:slug").get(
  jwtverify,
  getVideo
);

router.route("/").get(
  jwtverify,
  getAllVideos
);

router.route("/update-video/:videoId").put(
  Upload.single("thumbnail"),
  jwtverify,
  updateVideo
)

router.route("/delete-video/:videoId").delete(
  jwtverify,
  deleteVideo
)

export default router;
