const express = require("express");
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
  const { name, phone, bloodType, location } = req.body;

  if (!name || !bloodType || !location) {
    return res.status(400).json({
      error: "Name, blood type, and location are required",
    });
  }

  const newDonor = {
    id: donorIdCounter++,
    name,
    phone: phone || "Not provided",
    bloodType,
    location,
    registeredAt: new Date().toISOString(),
  };

  donors.push(newDonor);

  res.status(201).json({
    message: "Donor registered successfully",
    donor: newDonor,
  });
});

app.post("/requests", (req, res) => {
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

  // Store full donor details instead of just IDs
  const matchingDonorDetails = matchingDonors.map((d) => ({
    id: d.id,
    name: d.name,
    phone: d.phone,
    bloodType: d.bloodType,
    location: d.location,
  }));

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
    matchingDonors: matchingDonors,
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
