const express = require("express");
const app = express();

const { initializeDatabase } = require("./db/db.connect");
const Lead = require("./models/lead.model");
const SalesAgent = require("./models/salesAgent.model");
const Comment = require("./models/comment.model");
const Tag = require("./models/tag.model");

const validator = require("validator");
const bcrypt = require("bcrypt");
const generateToken = require("./utils/generateToken");

const cors = require("cors");
const { default: mongoose } = require("mongoose");

const corsOptions = {
  origin: "*",
  credentials: true,
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));

app.use(express.json());

const PORT = 3000;

initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log("🚀 Server is running on PORT:", PORT);
  });
});

app.get("/", (req, res) => {
  res.send("CRM Application");
});

//API to sign up
app.post("/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ success: false, error: "All fields are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 8 characters",
      });
    }

    // Duplicate email check
    const existing = await SalesAgent.findOne({ email });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, error: "Email already registered" });
    }

    // Hash + persist
    const hashedPassword = await bcrypt.hash(password, 10);
    const salesAgent = await SalesAgent.create({
      name,
      email,
      password: hashedPassword,
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      agentId: salesAgent._id,
    });
  } catch (err) {
    console.error("Signup error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
});

// API to login into the web app
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await SalesAgent.findOne({ email });

    if (!user) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }
    const token = generateToken({
      id: user._id,
      email: user.email,
    });

    res.status(200).json({ token, user });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

// API to add a new lead
app.post("/leads", async (req, res) => {
  try {
    const { name, source, salesAgent, status, tags, timeToClose, priority } =
      req.body;

    if (!name) {
      return res
        .status(400)
        .json({ error: "Invalid input: Please add a valid name." });
    }

    if (!source) {
      return res
        .status(400)
        .json({ error: "Invalid input: Please add a valid source" });
    }

    const allowedStatus = [
      "New",
      "Contacted",
      "Qualified",
      "Proposal Sent",
      "Closed",
    ];

    if (status && !allowedStatus.includes(status)) {
      return res.status(400).json({
        error:
          "Invalid status input: Allowed values are: New, Contacted, Qualified, Proposal Sent, Closed.",
      });
    }

    if (timeToClose && timeToClose <= 0) {
      return res.status(400).json({
        error:
          "Invalid input: Please add a positive value for time to close input.",
      });
    }

    const allowedPriority = ["High", "Medium", "Low"];

    if (priority && !allowedPriority.includes(priority)) {
      return res.status(400).json({
        error: "Invalid input: Allowed values are: High, Medium and Low.",
      });
    }

    if (salesAgent) {
      const salesAgentExist = await SalesAgent.findById(salesAgent);

      if (!salesAgentExist) {
        return res
          .status(400)
          .json({ error: `Sales Agent with ${salesAgent} not found.` });
      }
    }

    const lead = await Lead.create({
      name,
      source,
      salesAgent,
      status,
      tags,
      timeToClose,
      priority,
    });

    await lead.populate("salesAgent");

    res.status(201).json({
      success: true,
      message: "Lead created successfully",
      data: {
        id: lead._id,
        name: lead.name,
        source: lead.source,
        salesAgent: lead.salesAgent,
        status: lead.status,
        tags: lead.tags,
        timeToClose: lead.timeToClose,
        priority: lead.priority,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
      },
    });
  } catch (error) {
    console.error(error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to add the lead.",
      error: error.message,
    });
  }
});

// API to filter and read the leads
app.get("/leads", async (req, res) => {
  try {
    const { source, salesAgent, status, tags, sort, order, priority } =
      req.query;

    const filters = {};

    const priorityOrder = {
      High: 3,
      Medium: 2,
      Low: 1,
    };

    const allowedSource = [
      "Website",
      "Referral",
      "Cold Call",
      "Advertisement",
      "Email",
      "Other",
    ];

    const allowedStatus = [
      "New",
      "Contacted",
      "Qualified",
      "Proposal Sent",
      "Closed",
    ];

    const allowedPriority = ["High", "Medium", "Low"];

    const allowedSort = ["priority", "timeToClose"];

    if (source) {
      if (!allowedSource.includes(source)) {
        return res.status(400).json({ error: "Invalid source" });
      }
      filters.source = source;
    }
    if (salesAgent) {
      if (!mongoose.Types.ObjectId(salesAgent)) {
        return res.status(400).json({ error: "Invalid sales agent id" });
      }
      filters.salesAgent = salesAgent;
    }

    if (status) {
      if (!allowedStatus.includes(status)) {
        return res.status(400).json({ error: "Invalid status." });
      }
      filters.status = status;
    }

    if (priority) {
      if (!allowedPriority.includes(priority)) {
        return res.status(400).json({ error: "Invalid priority" });
      }
      filters.priority = priority;
    }

    if (tags) {
      filters.tags = { $in: tags.split(",") };
    }

    if (sort) {
      if (!allowedSort.includes(sort)) {
        return res.status(400).json({ error: "Invalid sort type." });
      }
    }

    const leads = await Lead.find(filters).populate("salesAgent");

    let sortedData = leads;

    if (sort === "priority") {
      sortedData = leads.sort((a, b) => {
        const diff = priorityOrder[a.priority] - priorityOrder[b.priority];
        return order === "desc" ? -diff : diff;
      });
    }

    if (sort === "timeToClose") {
      sortedData = leads.sort((a, b) => {
        const diff = a.timeToClose - b.timeToClose;
        return order === "desc" ? -diff : diff;
      });
    }

    if (leads.length != 0) {
      res.status(200).json({
        success: true,
        count: leads.length,
        data: sortedData,
      });
    } else {
      res.status(404).json({ error: "Leads not found." });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch the leads", error: error.message });
  }
});

// API to update the lead
app.patch("/leads/:leadId", async (req, res) => {
  try {
    const { leadId } = req.params;
    const { tags, ...otherFields } = req.body;

    const updateQuery = {};

    if (Object.keys(otherFields).length > 0) {
      updateQuery.$set = otherFields;
    }

    if (Array.isArray(tags) && tags.length > 0) {
      updateQuery.$addToSet = {
        tags: { $each: tags },
      };
    }

    const updatedLead = await Lead.findByIdAndUpdate(leadId, updateQuery, {
      new: true,
    });

    if (!updatedLead) {
      return res.status(404).json({
        success: false,
        message: `${leadId} not found`,
      });
    }

    res.status(200).json({
      success: true,
      message: "Lead updated successfully",
      data: updatedLead,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update the data.", error: error.message });
  }
});

// API to delete a lead
app.delete("/leads/:leadId", async (req, res) => {
  try {
    const { leadId } = req.params;

    const deletedLead = await Lead.findByIdAndDelete(leadId);

    if (deletedLead) {
      res.status(200).json({ message: "Lead deleted successfully." });
    } else {
      res.status(404).json({ error: `Lead with ID ${leadId} not found.` });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to delete the lead.", error: error.message });
  }
});

// API to add anew sales agent
app.post("/agents", async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name || typeof name !== "string") {
      return res.status(400).json({
        error: "Name must be a valid string",
      });
    }

    if (!email || !validator.isEmail(email)) {
      return res
        .status(400)
        .json({ error: "Invalid email: Please enter a valid email address." });
    }

    const agent = new SalesAgent(req.body);
    const salesAgent = await agent.save();

    if (!salesAgent) {
      return res.status(400).json({ error: "Failed to add the sales agent." });
    } else {
      res.status(200).json({
        success: true,
        message: "Agent added successfully",
        data: {
          id: salesAgent._id,
          name: salesAgent.name,
          email: salesAgent.email,
          createdAt: salesAgent.createdAt,
          updatedAt: salesAgent.updatedAt,
        },
      });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to add the agent", error: error.message });
  }
});

// API to read all the sales agents
app.get("/agents", async (req, res) => {
  try {
    const allAgents = await SalesAgent.find();

    if (allAgents.length != 0) {
      res.status(200).json({
        success: true,
        message: "Sales Agents fetched successfully",
        data: allAgents,
      });
    } else {
      res.status(404).json({
        success: false,
        message: "Failed to fetch sales agents",
        error: error.message,
      });
    }
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch the agents data.",
      error: error.message,
    });
  }
});

// API to delete a sales agent
app.delete("/salesAgent/delete/:agentId", async (req, res) => {
  try {
    const { agentId } = req.params;

    const deletedAgent = await SalesAgent.findByIdAndDelete(agentId);

    await Lead.updateMany(
      { salesAgent: agentId },
      { $set: { salesAgent: null } },
    );

    if (deletedAgent) {
      res.status(200).json({ message: "Sales agent deleted successfully." });
    } else {
      res.status(404).json({ error: "Sales agent not found." });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to delete the agent.", error: error.message });
  }
});

// API to add a comment
app.post("/leads/:leadId/comments", async (req, res) => {
  try {
    const { leadId } = req.params;

    const { author, commentText } = req.body;

    if (!author || !commentText) {
      return res.status(400).json({ error: "Invalid comment" });
    }

    const savedComment = await Comment.create({
      lead: leadId,
      author,
      commentText,
    });

    if (savedComment) {
      res.status(200).json(savedComment);
    } else {
      res.status(404).json({ error: "Failed to add the comment." });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to add the comment", error: error.message });
  }
});

// API to read all the comments
app.get("/leads/:leadId/comments", async (req, res) => {
  try {
    const { leadId } = req.params;

    const leadComments = await Comment.find({ lead: leadId })
      .populate("lead")
      .populate("author")
      .sort({ createdAt: -1 });

    return res.status(200).json(leadComments);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch the data.", error: error.message });
  }
});

// API to read the lead which is closed in last 7 days
app.get("/report/last-week", async (req, res) => {
  try {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);

    const closedLastWeek = await Lead.find({
      status: "Closed",
      closedAt: { $gte: sevenDaysAgo },
    }).populate("salesAgent");

    if (closedLastWeek.length === 0) {
      return res.status(404).json({ error: "No leads closed last week" });
    }

    res.status(200).json({
      total: closedLastWeek.length,
      data: closedLastWeek,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch the data",
      error: error.message,
    });
  }
});

// app.listen(PORT, () => {
//   console.log('Server is running on the PORT:', PORT);
// });
