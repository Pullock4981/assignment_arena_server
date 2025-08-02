require('dotenv').config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const { MongoClient, ServerApiVersion } = require('mongodb');
const { ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_User}:${process.env.DB_Pass}@cluster0.mvzvvjx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// MongoDB Client Setup
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let assignments;
let submissions;
let users;

// Root route
app.get("/", (req, res) => {
    res.send("Assignment Arena Server is Running ✅");
});

// Main function to connect DB and define routes
async function run() {
    try {
        // Test MongoDB connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("✅ Pinged your deployment. Connected to MongoDB!");

        // Collections
        const db = client.db("assignment_arena_DB");
        assignments = db.collection("assignments");
        users = db.collection("users");
        submissions = db.collection("submissions");

        // --------USER INFO TO THE DATABASE-------//

        // GET all assignments
        app.get('/assignments', async (req, res) => {
            try {
                const allAssignments = await assignments.find().toArray();
                res.json(allAssignments);
            } catch (error) {
                console.error('GET /assignments error:', error);
                res.status(500).json({ message: 'Server error' });
            }
        });


        // Register User Route
        app.post("/register", async (req, res) => {
            const { name, email, password, role } = req.body;

            try {
                const existingUser = await users.findOne({ email });
                if (existingUser) {
                    return res.status(400).send("User already exists");
                }

                const hashedPassword = await bcrypt.hash(password, 10);
                await users.insertOne({ name, email, password: hashedPassword, role });

                res.send("User registered successfully");
            } catch (err) {
                console.error("❌ Registration Error:", err);
                res.status(500).send("Internal Server Error");
            }
        });

        // Login route
        app.post('/login', async (req, res) => {
            try {
                const { email, password } = req.body;

                const db = client.db("assignment_arena_DB");
                const usersCollection = db.collection("users");

                const user = await usersCollection.findOne({ email });
                if (!user) return res.status(404).send("User not found");

                const isPasswordValid = await bcrypt.compare(password, user.password);
                if (!isPasswordValid) return res.status(401).send("Wrong password");

                res.json({
                    id: user._id,
                    name: user.name,
                    role: user.role,
                    email: user.email
                });
            } catch (err) {
                console.error(err);
                res.status(500).send("Internal server error");
            }
        });

        // ------- DATA FOR INSTRACTOR END CODE----- //

        // POST A NEW ASSIGNMENT

        app.post('/assignments', async (req, res) => {
            try {
                const { title, description, deadline, createdBy } = req.body;

                // Validate required fields
                if (!title || !description || !deadline || !createdBy) {
                    return res.status(400).send("Missing required fields");
                }

                const newAssignment = {
                    title,
                    description,
                    deadline: new Date(deadline),   // store deadline as Date object
                    createdBy: new ObjectId(createdBy), // reference instructor user id
                    createdAt: new Date()
                };

                // Insert the new assignment document
                const result = await assignments.insertOne(newAssignment);

                res.status(201).send({ message: "Assignment created", id: result.insertedId });
            } catch (error) {
                console.error("❌ Create assignment error:", error);
                res.status(500).send("Internal Server Error");
            }
        });

    } catch (err) {
        console.error("❌ DB Connection Error:", err);
    }
}

// GET STUDENTS SUBMISSION
app.get('/submissions', async (req, res) => {
    try {
        // Fetch all submissions from the collection
        const allSubs = await submissions.find({}).toArray();
        res.json(allSubs);
    } catch (error) {
        console.error("❌ Fetch submissions error:", error);
        res.status(500).send("Internal Server Error");
    }
});

// GET assignment details by ID
app.get('/assignments/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const assignment = await assignments.findOne({ _id: new ObjectId(id) });

        if (!assignment) {
            return res.status(404).json({ message: "Assignment not found" });
        }

        res.json(assignment);
    } catch (error) {
        console.error("❌ Error fetching assignment details:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// get submitted aggignment by student
app.get('/submissions/student/:studentId', async (req, res) => {
    const studentId = req.params.studentId;

    try {
        const result = await submissions.aggregate([
            {
                $match: {
                    studentId: studentId  // stored as string
                }
            },
            {
                $lookup: {
                    from: "assignments",
                    localField: "assignmentId",
                    foreignField: "_id",
                    as: "assignmentInfo"
                }
            },
            {
                $unwind: "$assignmentInfo"
            },
            {
                $lookup: {
                    from: "users",
                    localField: "studentId",
                    foreignField: "_id",
                    as: "studentInfo"
                }
            },
            {
                $unwind: {
                    path: "$studentInfo",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: 1,
                    studentId: 1,
                    studentName: "$studentInfo.name",
                    assignmentId: "$assignmentId",
                    assignmentTitle: "$assignmentInfo.title",
                    assignmentDeadline: "$assignmentInfo.deadline",
                    submissionUrl: "$fileURL",
                    note: "$submissionText",
                    status: 1,
                    feedback: 1,
                    submittedAt: 1
                }
            }
        ]).toArray();

        res.json(result);
    } catch (error) {
        console.error("❌ Error fetching student submissions:", error);
        res.status(500).send("Internal Server Error");
    }
});


// GIVE FEEDBACK TO THE STUDENT'S ASSIGNMENT

app.put('/feedback/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { feedback, status } = req.body;

        if (!feedback && !status) {
            return res.status(400).send("Provide feedback or status to update");
        }

        const updateData = {};
        if (feedback) updateData.feedback = feedback;
        if (status) updateData.status = status;

        // Update the submission document with given feedback/status
        const result = await submissions.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).send("Submission not found");
        }

        res.send("Feedback updated successfully");
    } catch (error) {
        console.error("❌ Update feedback error:", error);
        res.status(500).send("Internal Server Error");
    }
});

// ---- STUDENTS END DATA CODE----//

/**
 * POST new submission
 */
app.post("/submit", async (req, res) => {
    const { studentId, assignmentId, submissionText, fileURL } = req.body;

    try {
        const newSubmission = {
            studentId,
            assignmentId: new ObjectId(assignmentId),
            submissionText,
            fileURL,
            status: "Submitted",
            feedback: null,
            submittedAt: new Date()
        };

        const result = await submissions.insertOne(newSubmission);
        res.status(201).json({ message: "Submission successful", submissionId: result.insertedId });
    } catch (err) {
        console.error("❌ Submission Error:", err);
        res.status(500).send("Internal server error");
    }
});

/**
 * GET submission status and feedback for a specific student
 */
app.get("/submissions/:studentId", async (req, res) => {
    const { studentId } = req.params;

    try {
        const studentSubmissions = await submissions
            .find({ studentId })
            .sort({ submittedAt: -1 })
            .toArray();

        res.json(studentSubmissions);
    } catch (err) {
        console.error("❌ Failed to get submissions:", err);
        res.status(500).send("Internal server error");
    }
});

// Express route for updating feedback/status
app.put('/submissions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { feedback, status } = req.body;

        const updateData = {};
        if (feedback !== undefined) updateData.feedback = feedback;
        if (status !== undefined) updateData.status = status;

        const result = await submissions.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).send("Submission not found");
        }

        res.json({ message: 'Submission updated successfully' });
    } catch (err) {
        console.error("❌ Feedback update error:", err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// for chart

app.get('/chart/:assignmentId', async (req, res) => {
    try {
        const { assignmentId } = req.params;

        const stats = await submissions.aggregate([
            {
                $match: {
                    assignmentId: new ObjectId(assignmentId)  // ✅ Correct
                }
            },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            }
        ]).toArray();

        res.json(stats);
    } catch (error) {
        console.error("❌ Chart data error:", error);
        res.status(500).send("Internal Server Error");
    }
});



run().catch(console.dir);

// Start server
app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
});
