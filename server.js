import express from 'express';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import schedule from 'node-schedule';
import fs from 'fs';
import { customAlphabet } from 'nanoid';
import { matchCVEWithSystems } from './src/js/matchSystem.js';
import { System, Group, CVE, MatchResult, ExportedCVE } from './models.js'; // Import models

// Set up file paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON
app.use(express.json());

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/myDashboard', {});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

const nanoid = customAlphabet('1234567890abcdef', 10);

// Serve static files
app.use(express.static(path.join(__dirname, 'src/html')));
app.use('/images', express.static(path.join(__dirname, 'src/images')));
app.use('/css', express.static(path.join(__dirname, 'src/css')));
app.use('/js', express.static(path.join(__dirname, 'src/js')));

// Enable CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    next();
});

const transporter = nodemailer.createTransport({
    service: 'hotmail',
    auth: {
        user: 'no-reply-vulnotify@outlook.com',
        pass: 'wnclzxbrsigomlru',
    },
    connectionTimeout: 2 * 60 * 1000,  // 2 minuten
    socketTimeout: 2 * 60 * 1000  // 2 minuten
});

// Function to send email with CVE details
async function sendEmail(recipient, cves, groupName) {
    const cveDetails = cves.map(cve => `
        CVE ID: ${cve.cve_id}
        Severity: ${cve.severity}
        Description: ${cve.description}
        Published Date: ${cve.published_date}
        URL: ${cve.url}
        Matched On: ${cve.matchType}
    `).join('\n\n');

    const mailOptions = {
        from: 'no-reply-vulnotify@outlook.com',
        to: recipient,
        subject: `New CVEs Exported for Group: ${groupName}`,
        text: `Group: ${groupName}\nCVE Details:\n${cveDetails}`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${recipient} with CVE details:`, cves);
    } catch (error) {
        console.error('Error sending email:', error);
    }
}

// Function to log information to a file
const LOG_FILE = 'cve_update_log.txt';
function logInfo(message) {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} - ${message}\n`);
}

// Function to fetch and save daily CVE updates
const fetchAndSaveCveUpdates = async () => {
    const scriptPath = path.join(__dirname, 'src', 'python', 'fetch_daily_updates.py');
    exec(`python "${scriptPath}"`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing script: ${error}`);
            logInfo(`Error executing script: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`Script error output: ${stderr}`);
            logInfo(`Script error output: ${stderr}`);
        }
        console.log(`Script stdout: ${stdout}`);
        logInfo(`Script stdout: ${stdout}`);
    });
};

// Endpoint to manually trigger daily CVE updates
app.post('/fetch-cve-updates', async (req, res) => {
    try {
        await fetchAndSaveCveUpdates();
        res.status(200).json({ message: 'CVE updates fetched successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching CVE updates', error: error.message });
    }
});

// Scheduler to run daily CVE updates
schedule.scheduleJob('0 0 * * *', async () => {
    console.log('Starting daily CVE update');
    await fetchAndSaveCveUpdates();
    console.log('Daily CVE update completed');
});

// API route to get refresh logs
app.get('/refresh-logs', (req, res) => {
    const logFilePath = path.join(__dirname, 'src', 'python', 'cve_update_log.txt');
    fs.readFile(logFilePath, 'utf-8', (err, data) => {
        if (err) {
            console.error('Error reading log file:', err);
            return res.status(500).json({ message: 'Internal Server Error', error: err.toString() });
        }
        const logLines = data.trim().split('\n');
        const logs = logLines.map(line => {
            const [timestamp, message] = line.split(' - ');
            return { timestamp, message };
        });
        res.json(logs);
    });
});


// Function to export CVEs to a group
const exportCves = async (groupId, exportAll = false) => {
    try {
        const group = await Group.findById(groupId).populate('systems');
        const systems = group.systems;
        let cvesToSend = [];

        for (const system of systems) {
            const matchResults = await MatchResult.find({ systemId: system._id });
            for (const matchResult of matchResults) {
                for (const cve of matchResult.matchedCVEs) {
                    const alreadyExported = await ExportedCVE.findOne({ groupId, systemId: system._id, cveId: cve._id });
                    if (exportAll || !alreadyExported) {
                        cvesToSend.push(cve);
                        if (!exportAll) {
                            const exportedCve = new ExportedCVE({ groupId, systemId: system._id, cveId: cve._id });
                            await exportedCve.save();
                        }
                    }
                }
            }
        }

        if (cvesToSend.length > 0) {
            await sendEmail(group.email, cvesToSend, group.name);
            console.log(`CVEs exported for group ${group.name}`);
        } else {
            console.log(`No new CVEs to export for group ${group.name}`);
        }
    } catch (error) {
        console.error('Error exporting CVEs:', error);
    }
};

// API route to get match results
app.get('/match-results', async (req, res) => {
    try {
        const matchResults = await MatchResult.find({});
        res.json(matchResults);
    } catch (error) {
        console.error('Error retrieving match results:', error);
        res.status(500).json({ message: "Internal Server Error", error: error.toString() });
    }
});

// Binnen je server context (bijvoorbeeld in een API route of gepland proces)
app.post('/match-cves', async (req, res) => {
    try {
        const results = await matchCVEWithSystems({ matchVersion: true });
        res.status(200).json({ message: 'Matching completed successfully', details: results });
    } catch (error) {
        console.error('Error matching CVEs with systems:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.toString() });
    }
});


app.post('/systems', async (req, res) => {
    try {
        const { platform, platformVersion, architecture, hostname, ipAddress, cpu, installedSoftware, keywords } = req.body;

        // Verwerk keywords
        let keywordsArray = [];
        if (keywords) {
            if (typeof keywords === 'string') {
                keywordsArray = keywords.split(',').map(kw => kw.trim().toLowerCase()).filter(kw => kw !== '');
            } else if (Array.isArray(keywords)) {
                keywordsArray = keywords.map(kw => kw.trim().toLowerCase()).filter(kw => kw !== '');
            }
        }

        // Verwerk installedSoftware en stel standaardwaarden in
        const processedSoftware = (installedSoftware || []).map(soft => ({
            name: soft.name.trim().toLowerCase(),
            version: soft.version ? soft.version.trim() : 'unknown' // Stel 'unknown' in als versie ontbreekt
        }));

        const newSystem = new System({
            customId: `SL-${nanoid()}`,
            platform: (platform || 'unknown').trim().toLowerCase(),
            platformVersion: (platformVersion || 'unknown').trim().toLowerCase(),
            architecture: (architecture || 'unknown').trim().toLowerCase(),
            hostname: (hostname || 'unknown').trim(),
            ipAddress: (ipAddress || 'unknown').trim(),
            cpu: (cpu || 'unknown').trim(),
            installedSoftware: processedSoftware,
            keywords: keywordsArray
        });

        const savedSystem = await newSystem.save();
        res.status(201).json({ success: true, data: savedSystem });
    } catch (error) {
        console.error('Failed to create a new system:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});


// API route to get all systems
app.get('/systems', async (req, res) => {
    try {
        // Zorg ervoor dat je 'groups' ophaalt met 'populate'
        const systems = await System.find({}).populate('groups');
        res.json(systems);
    } catch (error) {
        console.error('Error fetching systems:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});


// API route to get a specific system by customId
app.get('/systems/:customId', async (req, res) => {
    try {
        const system = await System.findOne({ customId: req.params.customId });
        if (!system) {
            return res.status(404).send({ message: 'System not found' });
        }
        res.send(system);
    } catch (error) {
        console.error('Error retrieving system:', error);
        res.status(500).send({ message: "Internal Server Error", error: error.toString() });
    }
});

app.post('/retrieve-cves', async (req, res) => {
    const { severity, dateRange, keyword, excludeResolved } = req.body;
    let filter = {};

    if (severity) {
        filter.baseSeverity = severity;
    }

    if (dateRange) {
        const now = new Date();
        now.setUTCHours(0, 0, 0, 0);
        const dateFrom = new Date(now);
        dateFrom.setDate(dateFrom.getDate() - dateRange);
        const dateFromStr = dateFrom.toISOString().split('T')[0];
        const nowStr = now.toISOString().split('T')[0];

        filter.$expr = {
            $and: [
                { $gte: [{ $substr: ["$published_date", 0, 10] }, dateFromStr] },
                { $lt: [{ $substr: ["$published_date", 0, 10] }, nowStr] }
            ]
        };
    }

    if (keyword) {
        filter.$or = [
            { description: new RegExp(keyword, 'i') },
            { cve_id: new RegExp(keyword, 'i') },
            { 'affected.product': new RegExp(keyword, 'i') }
        ];
    }

    if (excludeResolved) {
        filter.description = { $not: /resolved/i };
    }

    try {
        const cves = await CVE.find(filter);
        res.json(cves);
    } catch (error) {
        console.error('Error retrieving CVEs:', error);
        res.status(500).json({ message: "Internal Server Error", error: error.toString() });
    }
});

app.put('/systems/:customId', async (req, res) => {
    try {
        const { platform, platformVersion, architecture, hostname, ipAddress, cpu, installedSoftware, keywords } = req.body;

        // Verwerk keywords
        let keywordsArray = [];
        if (keywords) {
            if (typeof keywords === 'string') {
                keywordsArray = keywords.split(',').map(kw => kw.trim().toLowerCase()).filter(kw => kw !== '');
            } else if (Array.isArray(keywords)) {
                keywordsArray = keywords.map(kw => kw.trim().toLowerCase()).filter(kw => kw !== '');
            }
        }

        // Verwerk installedSoftware en stel standaardwaarden in
        const processedSoftware = (installedSoftware || []).map(soft => ({
            name: soft.name.trim().toLowerCase(),
            version: soft.version ? soft.version.trim() : 'unknown' // Stel 'unknown' in als versie ontbreekt
        }));

        const updatedData = {
            platform: (platform || 'unknown').trim().toLowerCase(),
            platformVersion: (platformVersion || 'unknown').trim().toLowerCase(),
            architecture: (architecture || 'unknown').trim().toLowerCase(),
            hostname: (hostname || 'unknown').trim(),
            ipAddress: (ipAddress || 'unknown').trim(),
            cpu: (cpu || 'unknown').trim(),
            installedSoftware: processedSoftware,
            keywords: keywordsArray
        };

        const updatedSystem = await System.findOneAndUpdate(
            { customId: req.params.customId },
            { $set: updatedData },
            { new: true }
        );
        if (!updatedSystem) {
            return res.status(404).send({ message: 'System not found' });
        }
        res.send(updatedSystem);
    } catch (error) {
        console.error('Update failed:', error);
        res.status(400).send({ message: 'Internal Server Error', error: error.message });
    }
});

// API route to create a new group
app.post('/groups', async (req, res) => {
    const newGroup = new Group(req.body);
    try {
        const savedGroup = await newGroup.save();
        console.log(savedGroup);
        res.status(201).send(savedGroup);
    } catch (error) {
        res.status(400).send(error);
    }
});

// API route to get all groups
app.get('/groups', async (req, res) => {
    try {
        const groups = await Group.find({}).populate('systems');
        res.json(groups);
    } catch (error) {
        console.error('Error retrieving groups:', error);
        res.status(500).json({ message: "Internal Server Error", error: error.toString() });
    }
});

// API route to get a specific group by customId
app.get('/groups/:customId', async (req, res) => {
    try {
        const group = await Group.findOne({ customId: req.params.customId }).populate('systems');
        if (!group) {
            return res.status(404).send({ message: 'Group not found' });
        }
        res.json(group);
    } catch (error) {
        console.error('Error retrieving group:', error);
        res.status(500).send({ message: "Internal Server Error", error: error.toString() });
    }
});

// API route to update a specific group by customId
app.put('/groups/:customId', async (req, res) => {
    try {
        const updatedGroup = await Group.findOneAndUpdate(
            { customId: req.params.customId },
            { $set: req.body },
            { new: true }
        );
        if (!updatedGroup) {
            return res.status(404).send({ message: 'Group not found' });
        }
        res.send(updatedGroup);
    } catch (error) {
        console.error('Update failed:', error);
        res.status(400).send(error);
    }
});

app.delete('/systems/:customId', async (req, res) => {
    try {
        const deleted = await System.findOneAndDelete({ customId: req.params.customId });
        if (!deleted) {
            return res.status(404).send({ message: 'System not found' });
        }
        res.send({ message: 'System deleted successfully' });
    } catch (error) {
        console.error('Delete failed:', error);
        res.status(500).send({ message: 'Internal Server Error', error: error.toString() });
    }
});


// API route to delete a specific group by customId
app.delete('/groups/:customId', async (req, res) => {
    try {
        const deleted = await Group.findOneAndDelete({ customId: req.params.customId });
        if (!deleted) {
            return res.status(404).send({ message: 'Group not found' });
        }
        res.send({ message: 'Group deleted successfully' });
    } catch (error) {
        console.error('Delete failed:', error);
        res.status500.send(error);
    }
});

// API route to run system scan
app.get('/scan', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const scriptPath = path.join(__dirname, 'src', 'python', 'runScan.sh');
    exec(`"${scriptPath}"`, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).json({ error: error.message });
        }
        if (stderr) {
            console.error(`stderr: ${stderr}`);
            return res.status(500).json({ error: stderr });
        }
        try {
            const results = JSON.parse(stdout);
            res.json(results);
        } catch (parseError) {
            console.error('Parse Error:', parseError);
            res.status(500).json({ error: "Error parsing output" });
        }
    });
});

// Voorbeeld Express.js route handlers

app.post('/groups/:groupId/systems/:systemId', async (req, res) => {
    try {
        const { groupId, systemId } = req.params;

        // Zoek de groep op customId in plaats van _id
        const group = await Group.findOne({ customId: groupId });
        if (!group) {
            return res.status(404).send('Group not found');
        }

        // Zoek het systeem
        const system = await System.findById(systemId);
        if (!system) {
            return res.status(404).send('System not found');
        }

        // Voeg het systeem toe aan de groep als het nog niet bestaat
        if (!group.systems.includes(system._id)) {
            group.systems.push(system._id);
            await group.save();
        }

        // Voeg de groep toe aan het systeem als het nog niet bestaat
        if (!system.groups.includes(group._id)) {
            system.groups.push(group._id);
            await system.save();
        }

        res.status(200).send('System added to group and group added to system');
    } catch (error) {
        console.error('Error adding system to group:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.delete('/groups/:groupId/systems/:systemId', async (req, res) => {
    try {
        const { groupId, systemId } = req.params;

        // Zoek de groep op customId in plaats van _id
        const group = await Group.findOne({ customId: groupId });
        if (!group) {
            return res.status(404).send('Group not found');
        }

        // Verwijder het systeem uit de groep
        group.systems = group.systems.filter(id => id.toString() !== systemId);
        await group.save();

        // Zoek het systeem en verwijder de groep uit de 'groups' array
        const system = await System.findById(systemId);
        if (!system) {
            return res.status(404).send('System not found');
        }

        system.groups = system.groups.filter(id => id.toString() !== group._id.toString());
        await system.save();

        res.status(200).send('System removed from group and group removed from system');
    } catch (error) {
        console.error('Error removing system from group:', error);
        res.status(500).send('Internal Server Error');
    }
});


// API route to export all CVEs for a group
app.post('/export-all-cves/:groupId', async (req, res) => {
    try {
        await exportCves(req.params.groupId, true);
        res.status(200).send({ message: 'All CVEs exported successfully' });
    } catch (error) {
        res.status(500).send({ message: 'Error exporting CVEs', error: error.toString() });
    }
});

// Scheduler to run fetch and save CVEs, match CVEs with systems, and export CVEs
schedule.scheduleJob('0 0 * * *', async () => {
    console.log('Starting scheduled task');
    await fetchAndSaveCveUpdates();
    console.log('CVEs fetched and saved');

    await new Promise(resolve => setTimeout(resolve, 180000)); // Wait for 3 minutes

    await matchCVEWithSystems();
    console.log('CVEs matched with systems');

    await new Promise(resolve => setTimeout(resolve, 180000)); // Wait for 3 minutes

    const groups = await Group.find({});
    for (const group of groups) {
        await exportCves(group._id);
    }
});

// Fallback route to serve index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/html', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
