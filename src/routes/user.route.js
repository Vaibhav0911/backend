import { Router } from "express";
import { Upload } from "../middlewares/upload.middleware.js";
import { jwtverify } from "../middlewares/auth.middleware.js";
import { 
  userRegister,
  userLogin,
  userLogout 
} from "../controllers/user.controller.js";

const router = Router();

router.route("/register").post(
  Upload.fields([
    { name: "profileimage", maxCount: 1 },
    { name: "coverimage", maxCount: 2 },
  ]),
  userRegister
);

router.route("/login").post(
  Upload.none(),
  userLogin
)

router.route("/logout").post(
  jwtverify,
  userLogout
)

export default router;
