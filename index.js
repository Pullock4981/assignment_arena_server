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

// Root route
app.get("/", (req, res) => {
    res.send("Assignment Arena Server is Running ✅");
});

// Main function to connect DB and define routes
async function run() {
    try {
        // Test MongoDB connection
        await client.db("admin").command({ ping: 1 });
        console.log("✅ Pinged your deployment. Connected to MongoDB!");

        // Collections
        const db = client.db("assignment_arena_DB");
        const users = db.collection("users");

        // 🚀 Register User Route
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
        // 👉 Login route
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

    } catch (err) {
        console.error("❌ DB Connection Error:", err);
    }
}

run().catch(console.dir);

// Start server
app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
});
