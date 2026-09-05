const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    thumbnail: {
      type: String,
      default: "",
    },
    previewVideo: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      required: true,
      enum: [
        "Programming",
        "Design",
        "Business",
        "Marketing",
        "Data Science",
        "Music",
        "Photography",
        "Fitness",
        "Language",
        "Other",
      ],
    },
    level: {
      type: String,
      enum: ["Beginner", "Intermediate", "Advanced"],
      default: "Beginner",
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    lessons: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Lesson",
      },
    ],
    enrolledStudents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    rating: {
      average: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
    tags: [String],
  },
  { timestamps: true }
);

// Virtual for lesson count
courseSchema.virtual("lessonCount").get(function () {
  return Array.isArray(this.lessons) ? this.lessons.length : 0;
});

courseSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Course", courseSchema);
