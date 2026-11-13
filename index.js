const express = require("express");
const fetch = require("node-fetch");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

let donors = [];
let requests = [];
let donorIdCounter = 1;
let requestIdCounter = 1;

// Real AI Match Score using Google Gemini API
async function getAIMatchScore(donor, bloodTypeNeeded, location) {
  const apiKey = process.env.GEMINI_API_KEY;

  // If no API key is found, fall back to a basic score so the app doesn't crash
  if (!apiKey) return { score: 50, reason: "AI offline (No API Key)" };

  const prompt = `
    You are an AI medical assistant for a blood donation app.
    Donor Blood Type: ${donor.bloodType}
    Donor Location: ${donor.location}
    Donor Reliability: ${donor.reliabilityScore || 50}%
    Request Blood Type Needed: ${bloodTypeNeeded}
    Request Location: ${location}
    
    Rate this donor's match for the request on a scale of 0 to 100.
    Return ONLY a JSON object with two keys: "score" (a number) and "reason" (a short 5-8 word reason).
    Example: {"score": 95, "reason": "Exact blood type and nearby location."}
    `;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      },
    );

    const data = await response.json();
    let aiText = data.candidates[0].content.parts[0].text;

    // Clean up the AI text to make sure it's valid JSON
    aiText = aiText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(aiText);

    return { score: parsed.score, reason: parsed.reason };
  } catch (error) {
    console.error("AI Error:", error);
    return { score: 50, reason: "AI calculation error" };
  }
}

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to AKPO Blood Donor Network API",
    status: "running",
    endpoints: {
      donors: "/donors",
      requests: "/requests",
    },
  });
});

app.get("/donors", (req, res) => {
  res.json({
    message: "List of donors",
    count: donors.length,
    donors: donors,
  });
});

app.post("/donors", (req, res) => {
  const { name, phone, email, age, gender, lastDonation, bloodType, location } =
    req.body;

  if (!name || !bloodType || !location) {
    return res.status(400).json({
      error: "Name, blood type, and location are required",
    });
  }

  const newDonor = {
    id: donorIdCounter++,
    name,
    phone: phone || "Not provided",
    email: email || "Not provided",
    age: age || "Not provided",
    gender: gender || "Not provided",
    lastDonation: lastDonation || "Not provided",
    bloodType,
    location,
    reliabilityScore: Math.floor(Math.random() * 40) + 60, // Simulates a 60% - 100% score
    registeredAt: new Date().toISOString(),
  };

  donors.push(newDonor);

  res.status(201).json({
    message: "Donor registered successfully",
    donor: newDonor,
  });
});

app.post("/requests", async (req, res) => {
  const { patientName, hospital, bloodTypeNeeded, urgency, location } =
    req.body;

  if (!patientName || !hospital || !bloodTypeNeeded || !urgency) {
    return res.status(400).json({
      error: "Patient name, hospital, blood type, and urgency are required",
    });
  }

  const matchingDonors = donors.filter(
    (donor) => donor.bloodType === bloodTypeNeeded,
  );

  // Use AI to score all matching donors
  const matchingDonorDetails = await Promise.all(
    matchingDonors.map(async (d) => {
      const aiResult = await getAIMatchScore(d, bloodTypeNeeded, location);

      return {
        id: d.id,
        name: d.name,
        phone: d.phone,
        bloodType: d.bloodType,
        location: d.location,
        matchScore: aiResult.score,
        aiReason: aiResult.reason,
        reliabilityScore: d.reliabilityScore,
      };
    }),
  );

  // Sort donors by match score (highest first)
  matchingDonorDetails.sort((a, b) => b.matchScore - a.matchScore);

  const newRequest = {
    id: requestIdCounter++,
    patientName,
    hospital,
    bloodTypeNeeded,
    urgency,
    location: location || "Not specified",
    status: "pending",
    matchingDonors: matchingDonorDetails,
    createdAt: new Date().toISOString(),
  };

  requests.push(newRequest);

  res.status(201).json({
    message: "Blood request created successfully",
    request: newRequest,
    matchingDonorsCount: matchingDonors.length,
    matchingDonors: matchingDonorDetails,
  });
});

app.get("/requests", (req, res) => {
  res.json({
    message: "List of blood requests",
    count: requests.length,
    requests: requests,
  });
});

app.put("/requests/:id/status", (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;

  // Check if status is valid
  const validStatuses = ["pending", "matched", "fulfilled", "cancelled"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      error:
        "Invalid status. Must be one of: pending, matched, fulfilled, cancelled",
    });
  }

  // Find the request
  const request = requests.find((r) => r.id === id);
  if (!request) {
    return res.status(404).json({
      error: "Request not found",
    });
  }

  // Update the status
  request.status = status;

  res.json({
    message: "Status updated successfully",
    request: request,
  });
});

app.get("/donors/blood/:bloodType", (req, res) => {
  const bloodType = req.params.bloodType;
  const matchedDonors = donors.filter(
    (donor) => donor.bloodType.toUpperCase() === bloodType.toUpperCase(),
  );

  res.json({
    bloodType: bloodType,
    count: matchedDonors.length,
    donors: matchedDonors,
  });
});

app.delete("/donors/:id", (req, res) => {
  const id = parseInt(req.params.id);

  // Find the donor
  const donorIndex = donors.findIndex((d) => d.id === id);
  if (donorIndex === -1) {
    return res.status(404).json({
      error: "Donor not found",
    });
  }

  // Remove the donor
  donors.splice(donorIndex, 1);

  res.json({
    message: "Donor deleted successfully",
  });
});

app.delete("/requests/:id", (req, res) => {
  const id = parseInt(req.params.id);

  // Find the request
  const requestIndex = requests.findIndex((r) => r.id === id);
  if (requestIndex === -1) {
    return res.status(404).json({
      error: "Request not found",
    });
  }

  // Remove the request
  requests.splice(requestIndex, 1);

  res.json({
    message: "Request deleted successfully",
  });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
