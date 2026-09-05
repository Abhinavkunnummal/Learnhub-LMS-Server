const mongoose = require("mongoose");

const meetSessionSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // null means open to all enrolled students
    },
    title: {
      type: String,
      required: [true, "Session title is required"],
      trim: true,
    },
    type: {
      type: String,
      enum: ["review", "test", "viva", "doubt", "live_class"],
      default: "review",
    },
    description: {
      type: String,
      default: "",
    },
    meetLink: {
      type: String,
      required: [true, "Google Meet link is required"],
      trim: true,
    },
    scheduledAt: {
      type: Date,
      required: [true, "Scheduled date and time are required"],
    },
    duration: {
      type: Number,
      default: 45, // in minutes
    },
    status: {
      type: String,
      enum: ["scheduled", "live", "completed", "cancelled"],
      default: "scheduled",
    },
    testScore: {
      type: Number,
      default: null,
    },
    feedback: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MeetSession", meetSessionSchema);
