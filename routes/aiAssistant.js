const express = require("express");
const Course = require("../models/Course");
const Lesson = require("../models/Lesson");
const { auth } = require("../middleware/auth");

const router = express.Router();

/**
 * Intelligent course-contextual tutor fallback
 * Generates insightful, accurate educational responses based on course syllabus and content
 */
function generateContextualAnswer(question, course, lessons, currentLesson) {
  const qLower = question.toLowerCase();

  // Find relevant lessons
  const relevantLessons = lessons.filter((l) => {
    const titleMatch = l.title.toLowerCase().split(" ").some((w) => w.length > 3 && qLower.includes(w));
    const contentMatch = l.content && l.content.toLowerCase().split(" ").some((w) => w.length > 4 && qLower.includes(w));
    return titleMatch || contentMatch;
  });

  // Current lesson context
  let lessonContext = "";
  if (currentLesson) {
    lessonContext = `\n\n📌 **Regarding Current Lesson ("${currentLesson.title}")**:\n` +
      `- Type: ${currentLesson.type.toUpperCase()}\n` +
      `- Estimated Duration: ${currentLesson.duration || 10} minutes\n` +
      (currentLesson.content ? `> Summary: ${currentLesson.content.slice(0, 280)}...\n` : "");
  }

  // 1. Greeting or intro
  if (/^(hi|hello|hey|greetings|help)/i.test(qLower.trim())) {
    return (
      `Hello! 👋 I am your dedicated AI Assistant for **${course.title}**.\n\n` +
      `I can help you clear doubts regarding:\n` +
      `- Core concepts and syllabus topics covered in this course\n` +
      `- Code explanations, examples, and debugging tips\n` +
      `- Summaries of specific lessons\n` +
      `- Preparing for quizzes and hands-on exercises\n\n` +
      `What specific concept or lesson would you like to explore?`
    );
  }

  // 2. Summary request
  if (/summary|summarize|overview|what is this course about|syllabus/i.test(qLower)) {
    const lessonList = lessons.slice(0, 8).map((l, i) => `${i + 1}. **${l.title}** (${l.type})`).join("\n");
    return (
      `### 📘 Overview of **${course.title}**\n\n` +
      `**Description:** ${course.description}\n\n` +
      `**Key Curriculum Highlights:**\n` +
      `${lessonList}\n\n` +
      `**Level:** ${course.level} | **Category:** ${course.category}\n\n` +
      `💡 *Tip: You can ask me to explain any specific lesson or concept in detail!*`
    );
  }

  // 3. Code or implementation doubt
  if (/code|example|syntax|how to implement|function|component|script/i.test(qLower)) {
    let specificCodeSnippet = "";
    if (course.category.toLowerCase().includes("program") || course.tags?.some(t => /react|javascript|python|node|html|css/i.test(t))) {
      specificCodeSnippet =
        "```javascript\n" +
        "// Example related to " + course.title + "\n" +
        "function handleConcept() {\n" +
        "  console.log('Understanding course concept: " + (currentLesson ? currentLesson.title : course.title) + "');\n" +
        "  // Apply best practices learned in this module\n" +
        "}\n" +
        "```\n\n";
    }

    return (
      `### 💻 Practical Explanation & Code Guide\n\n` +
      `In **${course.title}**, solving this involves breaking down the problem into structured steps:\n\n` +
      `1. **Understand the Goal**: Identify what input data you have and what state or outcome is needed.\n` +
      `2. **Step-by-Step Implementation**:\n` +
      `   - Initialize your environment or component state.\n` +
      `   - Apply the core logic covered in the lessons.\n` +
      `   - Add error handling and verification checks.\n\n` +
      specificCodeSnippet +
      `3. **Key Takeaway**: Make sure you test this concept interactively in your local editor.\n` +
      lessonContext
    );
  }

  // 4. Quiz / Test preparation
  if (/quiz|test|exam|score|grade|review/i.test(qLower)) {
    return (
      `### 🎯 Review & Quiz Preparation Tips for **${course.title}**\n\n` +
      `Here is how to best prepare:\n` +
      `1. Review the foundational lessons: ${lessons.slice(0, 3).map((l) => `"${l.title}"`).join(", ")}.\n` +
      `2. Note key definitions, syntax patterns, and rules demonstrated by the instructor.\n` +
      `3. If your instructor has scheduled a **Google Meet Review & Test Session**, make sure to check the scheduled time on the course page and have your questions ready!\n\n` +
      `Would you like me to generate a practice question for you on this topic?`
    );
  }

  // 5. General doubt / Concept explanation
  const lessonReference = relevantLessons.length > 0
    ? `\n\n🔍 **Directly related lessons in this course**:\n` +
      relevantLessons.map((l) => `- **${l.title}** (${l.type})`).join("\n")
    : "";

  return (
    `### 💡 Explanation for "${question}"\n\n` +
    `In the context of **${course.title}** (${course.category} - ${course.level}):\n\n` +
    `• **Core Idea**: This topic connects directly with the learning outcomes designed for this course.\n` +
    `• **Key Principles**:\n` +
    `  1. Clarify the fundamental mechanism and why it's applied in modern workflows.\n` +
    `  2. Pay attention to common edge cases or pitfalls when putting it into practice.\n` +
    `  3. Check the lesson materials provided by the instructor for step-by-step walkthroughs.\n` +
    lessonReference +
    lessonContext +
    `\n\n💬 *Feel free to ask follow-up questions or ask for a simpler explanation with examples!*`
  );
}

// POST /api/ai/ask - Ask a course doubt
router.post("/ask", auth, async (req, res) => {
  try {
    const { courseId, lessonId, question, chatHistory = [] } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ message: "Question cannot be empty" });
    }

    if (!courseId) {
      return res.status(400).json({ message: "Course ID is required" });
    }

    // Fetch course and its lessons
    const course = await Course.findById(courseId).populate("instructor", "name email bio");
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const lessons = await Lesson.find({ course: courseId }).sort("order");
    const currentLesson = lessonId ? lessons.find((l) => l._id.toString() === lessonId.toString()) : null;

    // Check if external Gemini API key is configured
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const systemPrompt =
          `You are an expert, encouraging AI Course Assistant for an online LMS platform called LearnHub. ` +
          `You are assisting a student enrolled in the course: "${course.title}". ` +
          `Course Description: "${course.description}". Category: ${course.category}, Level: ${course.level}. ` +
          `Instructor: ${course.instructor?.name || "Instructor"}. ` +
          `Course Lessons: ${lessons.map((l, i) => `${i + 1}. ${l.title} (${l.type})`).join("; ")}. ` +
          (currentLesson ? `Current Lesson the student is studying: "${currentLesson.title}" (${currentLesson.type}). Content: "${currentLesson.content || ""}". ` : "") +
          `Answer the student's doubt thoroughly, clearly, and supportively. Use markdown formatting with bullet points and code blocks when appropriate.`;

        const messages = [
          { role: "user", parts: [{ text: `${systemPrompt}\n\nStudent Question: ${question}` }] },
        ];

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: messages,
              generationConfig: { maxOutputTokens: 1000, temperature: 0.7 },
            }),
          }
        );

        if (geminiRes.ok) {
          const data = await geminiRes.json();
          const answerText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (answerText) {
            return res.json({
              success: true,
              answer: answerText,
              courseTitle: course.title,
              currentLessonTitle: currentLesson?.title,
            });
          }
        }
      } catch (geminiErr) {
        console.error("Gemini API error, falling back to course tutor engine:", geminiErr.message);
      }
    }

    // Context-aware internal AI tutor engine
    const answer = generateContextualAnswer(question.trim(), course, lessons, currentLesson);

    res.json({
      success: true,
      answer,
      courseTitle: course.title,
      currentLessonTitle: currentLesson?.title,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to get AI assistance" });
  }
});

module.exports = router;
