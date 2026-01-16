const express = require('express');
const app = express();

const { initializeDatabase } = require('./db/db.connect');
const Lead = require('./models/lead.model');
const SalesAgent = require('./models/salesAgent.model');
const Comment = require('./models/comment.model');
const Tag = require('./models/tag.model');

const validator = require('validator');

const cors = require('cors');
const { default: mongoose } = require('mongoose');

const corsOptions = {
  origin: '*',
  credentials: true,
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));

app.use(express.json());

initializeDatabase();

app.get('/', (req, res) => {
  res.send('CRM Application');
});

// API to add a new lead
app.post('/leads', async (req, res) => {
  try {
    const { name, source, salesAgent, status, tags, timeToClose, priority } =
      req.body;

    if (!name) {
      return res
        .status(400)
        .json({ error: 'Invalid input: Please add a valid name.' });
    }

    if (!source) {
      return res
        .status(400)
        .json({ error: 'Invalid input: Please add a valid source' });
    }

    const allowedStatus = [
      'New',
      'Contacted',
      'Qualified',
      'Proposal Sent',
      'Closed',
    ];

    if (status && !allowedStatus.includes(status)) {
      return res.status(400).json({
        error:
          'Invalid status input: Allowed values are: New, Contacted, Qualified, Proposal Sent, Closed.',
      });
    }

    if (timeToClose && timeToClose <= 0) {
      return res.status(400).json({
        error:
          'Invalid input: Please add a positive value for time to close input.',
      });
    }

    const allowedPriority = ['High', 'Medium', 'Low'];

    if (priority && !allowedPriority.includes(priority)) {
      return res.status(400).json({
        error: 'Invalid input: Allowed values are: High, Medium and Low.',
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

    await lead.populate('salesAgent');

    res.status(201).json({
      success: true,
      message: 'Lead created successfully',
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
      message: 'Failed to add the lead.',
      error: error.message,
    });
  }
});

// API to filter and read the leads
app.get('/leads', async (req, res) => {
  try {
    const { source, salesAgent, status, tags, sort, order } = req.query;

    const filters = {};

    const sortObj = {};

    const priorityOrder = {
      high: 3,
      medium: 2,
      low: 1,
    }

    const allowedSource = [
      'Website',
      'Referral',
      'Cold Call',
      'Advertisement',
      'Email',
      'Other',
    ];

    const allowedStatus = [
      'New',
      'Contacted',
      'Qualified',
      'Proposal Sent',
      'Closed',
    ];

    const allowedSort = ["priority", "timeToClose"]

    if (source) {
      if (!allowedSource.includes(source)) {
        return res.status(400).json({ error: 'Invalid source' });
      }
      filters.source = source;
    }
    if (salesAgent) {
      if (!mongoose.Types.ObjectId(salesAgent)) {
        return res.status(400).json({ error: 'Invalid sales agent id' });
      }
      filters.salesAgent = salesAgent;
    }

    if (status) {
      if (!allowedStatus.includes(status)) {
        return res.status(400).json({ error: 'Invalid status.' });
      }
      filters.status = status;
    }

    if (tags) {
      filters.tags = { $in: tags.split(',') };
    }

    if (sort) {
      if (!allowedSort.includes(sort)) {
        return res.status(400).json({error: "Invalid sort type."})
      }
      sortObj[sort] = order === "desc" ? -1 : 1;
    }

    const leads = await Lead.find(filters).sort(sortObj).populate('salesAgent');

    if (leads.length != 0) {
      res.status(200).json({
        success: true,
        count: leads.length,
        data: leads,
      });
    } else {
      res.status(404).json({ error: 'Leads not found.' });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Failed to fetch the leads', error: error.message });
  }
});

// API to update the lead
app.patch('/leads/:leadId', async (req, res) => {
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
      message: 'Lead updated successfully',
      data: updatedLead,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Failed to update the data.', error: error.message });
  }
});

// API to delete a lead
app.delete('/leads/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;

    const deletedLead = await Lead.findByIdAndDelete(leadId);

    if (deletedLead) {
      res.status(200).json({ message: 'Lead deleted successfully.' });
    } else {
      res.status(404).json({ error: `Lead with ID ${leadId} not found.` });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Failed to delete the lead.', error: error.message });
  }
});

// API to add anew sales agent
app.post('/agents', async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        error: 'Name must be a valid string',
      });
    }

    if (!email || !validator.isEmail(email)) {
      return res
        .status(400)
        .json({ error: 'Invalid email: Please enter a valid email address.' });
    }

    const agent = new SalesAgent(req.body);
    const salesAgent = await agent.save();

    if (!salesAgent) {
      return res.status(400).json({ error: 'Failed to add the sales agent.' });
    } else {
      res.status(200).json({
        success: true,
        message: 'Agent added successfully',
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
      .json({ message: 'Failed to add the agent', error: error.message });
  }
});

// API to read all the sales agents
app.get('/agents', async (req, res) => {
  try {
    const allAgents = await SalesAgent.find();

    if (allAgents.length != 0) {
      res.status(200).json({
        success: true,
        message: 'Sales Agents fetched successfully',
        data: allAgents,
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Failed to fetch sales agents',
        error: error.message,
      });
    }
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch the agents data.',
      error: error.message,
    });
  }
});

// API to add a comment
app.post('/leads/:leadId/comments', async (req, res) => {
  try {
    const { leadId } = req.params;

    const { author, commentText } = req.body;

    if (!author || !commentText) {
      return res.status(400).json({ error: 'Invalid comment' });
    }

    const savedComment = await Comment.create({
      lead: leadId,
      author,
      commentText,
    });

    if (savedComment) {
      res.status(200).json(savedComment);
    } else {
      res.status(404).json({ error: 'Failed to add the comment.' });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Failed to add the comment', error: error.message });
  }
});

// API to read all the comments
app.get('/leads/:leadId/comments', async (req, res) => {
  try {
    const { leadId } = req.params;

    const leadComments = await Comment.find({ lead: leadId })
      .populate('lead')
      .populate('author')
      .sort({ createdAt: -1 });    

    if (leadComments.length > 0) {
      res.send(leadComments);
    } else {
      res.status(404).json({ error: 'Failed to find the comment' });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Failed to fetch the data.', error: error.message });
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


const PORT = 3000;
app.listen(PORT, () => {
  console.log('Server is running on the PORT:', PORT);
});
