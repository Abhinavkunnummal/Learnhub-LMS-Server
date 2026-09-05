const express = require("express");
const MeetSession = require("../models/MeetSession");
const Course = require("../models/Course");
const Enrollment = require("../models/Enrollment");
const { auth } = require("../middleware/auth");

const router = express.Router();

// GET /api/meet-sessions/course/:courseId - Get sessions for a course
router.get("/course/:courseId", auth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user._id;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const isInstructor = course.instructor.toString() === userId.toString();
    const isAdmin = req.user.role === "admin";

    let query = { course: courseId };
    if (!isInstructor && !isAdmin) {
      // Student: can only see general course sessions or sessions targeted to them
      query.$or = [{ student: null }, { student: userId }];
    }

    const sessions = await MeetSession.find(query)
      .populate("instructor", "name email avatar")
      .populate("student", "name email avatar")
      .sort("scheduledAt");

    res.json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to fetch meet sessions" });
  }
});

// GET /api/meet-sessions/my-sessions - Get current user's meet sessions
router.get("/my-sessions", auth, async (req, res) => {
  try {
    const userId = req.user._id;
    let query = {};

    if (req.user.role === "instructor") {
      query.instructor = userId;
    } else if (req.user.role === "admin") {
      // admin can view all
    } else {
      // Student: find courses they are enrolled in
      const enrollments = await Enrollment.find({ student: userId }).select("course");
      const courseIds = enrollments.map((e) => e.course);
      query = {
        course: { $in: courseIds },
        $or: [{ student: null }, { student: userId }],
      };
    }

    const sessions = await MeetSession.find(query)
      .populate("course", "title thumbnail category")
      .populate("instructor", "name email avatar")
      .populate("student", "name email avatar")
      .sort("scheduledAt");

    res.json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to fetch my meet sessions" });
  }
});

// POST /api/meet-sessions - Create review/test session
router.post("/", auth, async (req, res) => {
  try {
    const {
      courseId,
      title,
      type = "review",
      description = "",
      meetLink,
      scheduledAt,
      duration = 45,
      studentId = null,
    } = req.body;

    if (!courseId || !title || !meetLink || !scheduledAt) {
      return res.status(400).json({
        message: "Course, title, Google Meet link, and scheduled date/time are required",
      });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Check permission
    const isInstructor = course.instructor.toString() === req.user._id.toString();
    if (!isInstructor && req.user.role !== "admin") {
      return res.status(403).json({
        message: "Only the course instructor or an admin can schedule Google Meet sessions",
      });
    }

    // Format meetLink: ensure http/https
    let formattedMeetLink = meetLink.trim();
    if (!formattedMeetLink.startsWith("http://") && !formattedMeetLink.startsWith("https://")) {
      formattedMeetLink = `https://${formattedMeetLink}`;
    }

    const session = await MeetSession.create({
      course: courseId,
      instructor: req.user._id,
      student: studentId || null,
      title: title.trim(),
      type,
      description: description.trim(),
      meetLink: formattedMeetLink,
      scheduledAt: new Date(scheduledAt),
      duration: Number(duration) || 45,
      status: "scheduled",
    });

    const populated = await MeetSession.findById(session._id)
      .populate("instructor", "name email avatar")
      .populate("student", "name email avatar")
      .populate("course", "title");

    res.status(201).json({
      success: true,
      message: "Google Meet session scheduled successfully",
      session: populated,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to schedule session" });
  }
});

// PUT /api/meet-sessions/:id - Update session
router.put("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const session = await MeetSession.findById(id).populate("course");

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const isInstructor = session.instructor.toString() === req.user._id.toString();
    if (!isInstructor && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to modify this session" });
    }

    const {
      title,
      type,
      description,
      meetLink,
      scheduledAt,
      duration,
      status,
      testScore,
      feedback,
      studentId,
    } = req.body;

    if (title) session.title = title.trim();
    if (type) session.type = type;
    if (description !== undefined) session.description = description.trim();
    if (meetLink) {
      let formatted = meetLink.trim();
      if (!formatted.startsWith("http://") && !formatted.startsWith("https://")) {
        formatted = `https://${formatted}`;
      }
      session.meetLink = formatted;
    }
    if (scheduledAt) session.scheduledAt = new Date(scheduledAt);
    if (duration) session.duration = Number(duration);
    if (status) session.status = status;
    if (testScore !== undefined) session.testScore = testScore;
    if (feedback !== undefined) session.feedback = feedback;
    if (studentId !== undefined) session.student = studentId || null;

    await session.save();

    const updated = await MeetSession.findById(id)
      .populate("instructor", "name email avatar")
      .populate("student", "name email avatar")
      .populate("course", "title");

    res.json({ success: true, session: updated, message: "Session updated successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to update session" });
  }
});

// DELETE /api/meet-sessions/:id - Delete session
router.delete("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const session = await MeetSession.findById(id);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const isInstructor = session.instructor.toString() === req.user._id.toString();
    if (!isInstructor && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to delete this session" });
    }

    await MeetSession.findByIdAndDelete(id);
    res.json({ success: true, message: "Session deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to delete session" });
  }
});

module.exports = router;
