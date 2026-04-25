import jwt from "jsonwebtoken";
import { Users } from "../models/users.model.js";

export const optionalAuth = async (req, res, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      return next();      // continue as guest
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    
    const user = await Users.findById(decoded?.id).select(
      "-password -refreshToken"
    );

    if (user) {
      req.user = user;    //set user only if valid
    }

    next();
  } catch (error) {
    // just continue as guest
    next();
  }
};
