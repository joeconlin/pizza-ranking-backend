const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { google } = require('googleapis');

// Load Service Account Credentials
const credentials = process.env.NODE_ENV === 'production'
  ? JSON.parse(process.env.GOOGLE_CREDENTIALS)
  : require('./PizzaRankingService.json');

const app = express();
app.use(bodyParser.json());

app.use(cors({
  origin: [
    'https://pizza-ranking-frontend.vercel.app',  // Your production Vercel domain
    'https://pizza.chumb.us',
    'http://localhost:3000'
  ],
  credentials: false,
  methods: ['GET', 'POST']
}));

// Google Sheets API Setup
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: SCOPES,
});
const sheets = google.sheets({ version: 'v4', auth });

// Replace with your Google Sheets ID
const SPREADSHEET_ID = '1PufqeJfGoq6K1XSsKESX122TKVUyDrORKPgInatZhyM';

// Endpoint to Submit Rankings
app.post('/submit-rating', async (req, res) => {
  const { userCode, spotName, notes, ratings } = req.body;
  const { crust, sauce, cheese, flavor: overallFlavor } = ratings;

  try {
    // Fetch `userName` from UserMapping Sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'UserMapping!A:B', // Column A: userCode, Column B: userName
    });

    const rows = response.data.values || [];
    const matchingRow = rows.find(row => row[0] === userCode);
    const userName = matchingRow ? matchingRow[1] : 'Unknown User';

    // Fetch existing ratings data
    const sheetData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:I',
    });

    const rowsData = sheetData.data.values || [];
    const matchIndex = rowsData.slice(1).findIndex(
      (row) => row[0] === userCode && row[1] === spotName
    );

    if (matchIndex !== -1) {
      // Update existing rating
      const rowNumber = matchIndex + 2; // Account for header row and 1-based indexing
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Sheet1!A${rowNumber}:I${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            userCode, spotName, userName, crust, sauce, cheese, overallFlavor, notes, new Date().toISOString()
          ]],
        },
      });
    } else {
      // Add a new rating
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A:I',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            userCode, spotName, userName, crust, sauce, cheese, overallFlavor, notes, new Date().toISOString()
          ]],
        },
      });
    }

    res.status(200).json({ message: 'Rating submitted successfully!' });
  } catch (error) {
    console.error('Error handling rating submission:', error.message);
    res.status(500).json({ error: 'Failed to submit rating.' });
  }
});


app.get('/get-user-ratings', async (req, res) => {
  const { userCode } = req.query;

  try {
    const ratingsData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:I', // Ensure range covers all columns
    });

    const ratingsRows = ratingsData.data.values || [];
    const userRatings = ratingsRows
      .slice(1) // Skip the header row
      .filter((row) => row[0] === userCode) // Match by userCode
      .map((row) => ({
        spotName: row[1],
        crust: row[3],
        sauce: row[4],
        cheese: row[5],
        overallFlavor: row[6],
      }));

    res.status(200).json(userRatings);
  } catch (error) {
    console.error('Error fetching user ratings:', error.message);
    res.status(500).json({ error: 'Failed to fetch user ratings.' });
  }
});


app.post('/set-name', async (req, res) => {
  const { userCode, userName } = req.body;

  try {
    const userMappingSheet = 'UserMapping!A:B';
    const existingMappings = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: userMappingSheet,
    });

    const mappings = existingMappings.data.values || [];
    const existingEntry = mappings.find(row => row[0] === userCode);

    if (existingEntry) {
      // Update existing name
      const rowIndex = mappings.findIndex(row => row[0] === userCode) + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `UserMapping!B${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[userName]] },
      });
    } else {
      // Add new mapping
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: userMappingSheet,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[userCode, userName]],
        },
      });
    }

    res.status(200).json({ message: 'Name set successfully!' });
  } catch (error) {
    console.error('Error setting name:', error);
    res.status(500).json({ error: 'Failed to set name.' });
  }
});

app.post('/get-username', async (req, res) => {
  try {
    const { userCode } = req.body;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'UserMapping!A:B', // Column A: userCode, Column B: userName
    });

    const rows = response.data.values || [];
    const dataRows = rows.slice(1); // Exclude header row

    const matchingRow = dataRows.find((row) => row[0] === userCode);

    if (matchingRow) {
      res.status(200).json({ userName: matchingRow[1] });
    } else {
      res.status(200).json({ userName: null });
    }
  } catch (error) {
    console.error('Error fetching username:', error);
    res.status(500).json({ error: 'Failed to fetch username.' });
  }
});

app.get('/get-rating', async (req, res) => {
  const { userCode, spotName } = req.query;

  try {
    const sheetData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:I',
    });

    const rows = sheetData.data.values || [];
    const dataRows = rows.slice(1);

    const match = dataRows.find(
      (row) => row[0] === userCode && row[1] === spotName
    );

    if (match) {
      res.json({
        ratings: {
          crust: parseFloat(match[3]) || 5,
          sauce: parseFloat(match[4]) || 5,
          cheese: parseFloat(match[5]) || 5,
          flavor: parseFloat(match[6]) || 5,
        },
        notes: match[7] || '',
      });
    } else {
      res.json({ ratings: null, notes: '' });
    }
  } catch (error) {
    console.error('Error fetching ratings:', error);
    res.status(500).json({ error: 'Failed to fetch ratings.' });
  }
});


app.get('/get-spots', async (req, res) => {
  const { userCode } = req.query;

  try {
    // Fetch pizza spots
    const spotsData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'PizzaSpots!A:D',
    });

    const spotsRows = spotsData.data.values || [];
    const spots = spotsRows.slice(1).map((row) => ({
      spotName: row[0],
      address: row[1],
      description: row[2],
    }));

    // Fetch responses from Sheet1
    const responsesData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:D',
    });

    const responsesRows = responsesData.data.values || [];
    const responses = responsesRows
      .slice(1)
      .filter((row) => row[0] === userCode) // Filter by userCode
      .map((row) => ({
        spotName: row[1],
        crust: row[2],
        sauce: row[3],
      }));

    res.status(200).json({ spots, responses });
  } catch (error) {
    console.error("Error fetching spots:", error.message);
    res.status(500).json({ error: "Failed to fetch spots" });
  }
});



app.post('/update-ranked', async (req, res) => {
  try {
    const { spotName } = req.body;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'PizzaSpots!A:E', // Adjust to match your columns
    });

    const rows = response.data.values || [];
    const header = rows[0];
    const dataRows = rows.slice(1);

    const spotIndex = dataRows.findIndex((row) => row[0] === spotName);
    if (spotIndex !== -1) {
      const rowIndex = spotIndex + 2; // Account for header row and 1-based indexing
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `PizzaSpots!E${rowIndex}`, // Update the Ranked column
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['true']],
        },
      });
      res.status(200).json({ message: 'Ranked status updated successfully!' });
    } else {
      throw new Error('Spot not found');
    }
  } catch (error) {
    console.error('Error updating ranked status:', error.message);
    res.status(500).json({ error: 'Failed to update ranked status.' });
  }
});

app.get('/get-leaderboard', async (req, res) => {
  try {
    const ratingsData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:I', // Adjust the range as needed
    });

    const ratingsRows = ratingsData.data.values || [];
    const ratingsDataRows = ratingsRows.slice(1); // Skip header row

    const spots = {};
    ratingsDataRows.forEach((row) => {
      const spotName = row[1];
      const crust = parseFloat(row[3]) || 0;
      const sauce = parseFloat(row[4]) || 0;
      const cheese = parseFloat(row[5]) || 0;
      const overallFlavor = parseFloat(row[6]) || 0;

      if (!spots[spotName]) {
        spots[spotName] = {
          totalRatings: 0,
          totalCrust: 0,
          totalSauce: 0,
          totalCheese: 0,
          totalFlavor: 0,
        };
      }

      spots[spotName].totalRatings += 1;
      spots[spotName].totalCrust += crust;
      spots[spotName].totalSauce += sauce;
      spots[spotName].totalCheese += cheese;
      spots[spotName].totalFlavor += overallFlavor;
    });

    const leaderboard = Object.entries(spots).map(([spotName, stats]) => ({
      spotName,
      averageScore: (
        (stats.totalCrust +
          stats.totalSauce +
          stats.totalCheese +
          stats.totalFlavor) /
        stats.totalRatings
      ).toFixed(1),
      averageCrust: (stats.totalCrust / stats.totalRatings).toFixed(1),
      averageSauce: (stats.totalSauce / stats.totalRatings).toFixed(1),
      averageCheese: (stats.totalCheese / stats.totalRatings).toFixed(1),
      averageOverallFlavor: (stats.totalFlavor / stats.totalRatings).toFixed(1),
    }));

    // Sort leaderboard by average score in descending order
    leaderboard.sort((a, b) => b.averageScore - a.averageScore);

    res.status(200).json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error.message);
    res.status(500).json({ error: 'Failed to fetch leaderboard.' });
  }
});

app.post('/verify-code', async (req, res) => {
  try {
    const { userCode } = req.body;
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'UserMapping!A:B',
    });

    const rows = response.data.values || [];
    const exists = rows.some(row => row[0] === userCode);

    if (exists) {
      res.status(200).json({ valid: true });
    } else {
      res.status(404).json({ valid: false });
    }
  } catch (error) {
    console.error('Error verifying code:', error);
    res.status(500).json({ error: 'Failed to verify code' });
  }
});


// Start the Express Server
// server.js
const PORT = process.env.PORT || 5001;  // Use environment variable, fallback to 5001
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});