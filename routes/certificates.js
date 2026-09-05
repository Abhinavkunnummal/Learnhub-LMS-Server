const express = require("express");
const Certificate = require("../models/Certificate");
const { auth } = require("../middleware/auth");

const router = express.Router();

// GET /api/certificates/my-certificates - Get user's certificates
router.get("/my-certificates", auth, async (req, res) => {
  try {
    const certificates = await Certificate.find({ student: req.user._id })
      .populate("course", "title thumbnail category")
      .sort("-issuedAt");

    res.json({ success: true, certificates });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/certificates/verify/:certId - Verify a certificate
router.get("/verify/:certId", async (req, res) => {
  try {
    const certificate = await Certificate.findOne({
      certificateId: req.params.certId,
    })
      .populate("student", "name")
      .populate("course", "title category");

    if (!certificate) {
      return res.status(404).json({ message: "Certificate not found" });
    }

    res.json({
      success: true,
      certificate: {
        id: certificate.certificateId,
        student: certificate.student.name,
        course: certificate.course.title,
        category: certificate.course.category,
        issuedAt: certificate.issuedAt,
        completionDate: certificate.completionDate,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/certificates/:courseId - Get certificate for a specific course
router.get("/:courseId", auth, async (req, res) => {
  try {
    const certificate = await Certificate.findOne({
      student: req.user._id,
      course: req.params.courseId,
    })
      .populate("course", "title thumbnail category")
      .populate("student", "name");

    if (!certificate) {
      return res.status(404).json({ message: "Certificate not found" });
    }

    res.json({ success: true, certificate });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
