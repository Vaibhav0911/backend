import bcrypt from "bcrypt";
import mongoose, { Schema } from "mongoose";
import jwt from "jsonwebtoken";

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    fullname: {
      type: String,
      required: true,
    },
    profileimage: {
      type: String,
      default: ""
    },
    coverimage: {
      type: String,
      default: ""
    },
    password: {
      type: String,
      required: true,
    },
    refreshtoken: {
      type: String,
      default: ""
    },
    watchHistory: {
      type: Schema.Types.ObjectId,
      ref: "Videos",
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password"))   return;

  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(this.password, password);
};

userSchema.methods.accessToken = function () {
  try {
    return jwt.sign(
      {
        id: this._id,
        username: this.username,
        email: this.email,
      },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
    );
  } catch (error) {
    return error;
  }
};

userSchema.methods.refreshToken = function () {
  try {
    return jwt.sign(
      {
        id: this._id,
      },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRY }
    );
  } catch (error) {
    return null;
  }
};

export const Users = mongoose.model('Users', userSchema);
