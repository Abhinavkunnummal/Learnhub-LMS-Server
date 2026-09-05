const express = require("express");
const Message = require("../models/Message");
const Course = require("../models/Course");
const Enrollment = require("../models/Enrollment");
const User = require("../models/User");
const { auth } = require("../middleware/auth");

const router = express.Router();

// GET /api/messages/contacts - Get available chat contacts based on enrollments
router.get("/contacts", auth, async (req, res) => {
  try {
    const contacts = [];
    const userId = req.user._id;

    if (req.user.role === "instructor") {
      // Find courses taught by instructor
      const courses = await Course.find({ instructor: userId }).populate(
        "enrolledStudents",
        "name email avatar role"
      );

      for (const course of courses) {
        for (const student of course.enrolledStudents) {
          const unreadCount = await Message.countDocuments({
            course: course._id,
            sender: student._id,
            receiver: userId,
            read: false,
          });

          const lastMessage = await Message.findOne({
            course: course._id,
            $or: [
              { sender: userId, receiver: student._id },
              { sender: student._id, receiver: userId },
            ],
          }).sort("-createdAt");

          contacts.push({
            courseId: course._id,
            courseTitle: course.title,
            otherUser: {
              _id: student._id,
              name: student.name,
              email: student.email,
              avatar: student.avatar,
              role: "student",
            },
            unreadCount,
            lastMessage: lastMessage?.message || "Start conversation",
            lastMessageTime: lastMessage?.createdAt || course.createdAt,
          });
        }
      }
    } else {
      // Student: find courses enrolled in
      const enrollments = await Enrollment.find({ student: userId }).populate({
        path: "course",
        populate: { path: "instructor", select: "name email avatar role bio" },
      });

      for (const enroll of enrollments) {
        if (!enroll.course || !enroll.course.instructor) continue;
        const instructor = enroll.course.instructor;

        const unreadCount = await Message.countDocuments({
          course: enroll.course._id,
          sender: instructor._id,
          receiver: userId,
          read: false,
        });

        const lastMessage = await Message.findOne({
          course: enroll.course._id,
          $or: [
            { sender: userId, receiver: instructor._id },
            { sender: instructor._id, receiver: userId },
          ],
        }).sort("-createdAt");

        contacts.push({
          courseId: enroll.course._id,
          courseTitle: enroll.course.title,
          otherUser: {
            _id: instructor._id,
            name: instructor.name,
            email: instructor.email,
            avatar: instructor.avatar,
            role: "instructor",
            bio: instructor.bio,
          },
          unreadCount,
          lastMessage: lastMessage?.message || "Say hello to your instructor",
          lastMessageTime: lastMessage?.createdAt || enroll.createdAt,
        });
      }
    }

    res.json({ success: true, contacts });
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to fetch chat contacts" });
  }
});

// GET /api/messages/:courseId/:otherUserId - Get chat history
router.get("/:courseId/:otherUserId", auth, async (req, res) => {
  try {
    const { courseId, otherUserId } = req.params;
    const userId = req.user._id;

    // Verify course
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Verify enrollment or instructor status
    const isInstructor = course.instructor.toString() === userId.toString();
    const isEnrolled = await Enrollment.findOne({
      student: userId,
      course: courseId,
    });

    if (!isInstructor && !isEnrolled && req.user.role !== "admin") {
      return res.status(403).json({ message: "You must be enrolled to chat with the instructor" });
    }

    // Fetch messages
    const messages = await Message.find({
      course: courseId,
      $or: [
        { sender: userId, receiver: otherUserId },
        { sender: otherUserId, receiver: userId },
      ],
    })
      .populate("sender", "name avatar role")
      .sort("createdAt");

    // Mark unread messages as read
    await Message.updateMany(
      {
        course: courseId,
        sender: otherUserId,
        receiver: userId,
        read: false,
      },
      { $set: { read: true } }
    );

    const otherUser = await User.findById(otherUserId).select("name email avatar role");

    res.json({
      success: true,
      course: { id: course._id, title: course.title },
      otherUser,
      messages,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to load messages" });
  }
});

// POST /api/messages/:courseId/:otherUserId - Send a message
router.post("/:courseId/:otherUserId", auth, async (req, res) => {
  try {
    const { courseId, otherUserId } = req.params;
    const { message } = req.body;
    const userId = req.user._id;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Message content is required" });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Verify enrollment or instructor status
    const isInstructor = course.instructor.toString() === userId.toString();
    const isEnrolled = await Enrollment.findOne({
      student: userId,
      course: courseId,
    });

    if (!isInstructor && !isEnrolled && req.user.role !== "admin") {
      return res.status(403).json({ message: "You must be enrolled to message the instructor" });
    }

    const newMessage = await Message.create({
      course: courseId,
      sender: userId,
      receiver: otherUserId,
      message: message.trim(),
    });

    const populated = await Message.findById(newMessage._id).populate("sender", "name avatar role");

    res.status(201).json({ success: true, message: populated });
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to send message" });
  }
});

module.exports = router;
