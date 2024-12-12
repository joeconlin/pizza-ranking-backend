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

// Update the CORS configuration to allow your Vercel domain
app.use(cors({  // Remove this duplicate cors configuration
  origin: [
    'https://pizza-ranking-frontend-erkzy4yf7-joeconlins-projects.vercel.app',  
    'http://localhost:3000'  
  ],
  credentials: false  
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
  const { clientUID, spotName, user, notes, ratings } = req.body; // Extract ratings object
  const { crust, sauce, cheese, flavor: overallFlavor } = ratings; // Destructure scores

  try {
    // Step 1: Fetch all existing data from Sheet1
    const sheetData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:I', // Ensure range covers all columns
    });

    const rows = sheetData.data.values || [];
    const dataRows = rows.slice(1); // Skip the header row

    // Step 2: Find the matching row index
    const matchIndex = dataRows.findIndex(
      (row) => row[0] === clientUID && row[1] === spotName
    );

    if (matchIndex !== -1) {
      // Update existing row
      const rowNumber = matchIndex + 2; // Account for header row and 1-based indexing
      const existingNotes = dataRows[matchIndex][7] || ''; // Existing notes (Column H)

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Sheet1!A${rowNumber}:I${rowNumber}`, // Update the entire row
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            clientUID,             // Column A
            spotName,              // Column B
            user,                  // Column C
            crust,                 // Column D
            sauce,                 // Column E
            cheese,                // Column F
            overallFlavor,         // Column G
            `${existingNotes}\n${notes}`, // Append new notes
            new Date().toISOString(),    // Column I: Timestamp
          ]],
        },
      });
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A:I',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            clientUID,             // Column A
            spotName,              // Column B
            user,                  // Column C
            crust,                 // Column D
            sauce,                 // Column E
            cheese,                // Column F
            overallFlavor,         // Column G
            notes,                 // Column H
            new Date().toISOString(), // Column I: Timestamp
          ]],
        },
      });
    }

    // Update ranked status in PizzaSpots sheet
    const pizzaSpotsData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'PizzaSpots!A:E', // Ensure range covers all columns in PizzaSpots
    });

    const pizzaSpotsRows = pizzaSpotsData.data.values || [];
    const pizzaSpotsDataRows = pizzaSpotsRows.slice(1); // Skip the header row

    const spotIndex = pizzaSpotsDataRows.findIndex((row) => row[0] === spotName);

    if (spotIndex !== -1) {
      const spotRowNumber = spotIndex + 2; // Account for header row and 1-based indexing
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `PizzaSpots!E${spotRowNumber}`, // Update the "ranked" column
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['TRUE']], // Mark the spot as ranked
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
  const { clientUID } = req.query;

  try {
    const ratingsData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:I', // Ensure range covers all columns
    });

    const ratingsRows = ratingsData.data.values || [];
    const userRatings = ratingsRows
      .slice(1) // Skip the header row
      .filter((row) => row[0] === clientUID) // Match by clientUID
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
  const { clientUID, userName } = req.body;

  try {
    const userMappingSheet = 'UserMapping!A:B'; // UID in Column A, Name in Column B
    const existingMappings = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: userMappingSheet,
    });

    const mappings = existingMappings.data.values || [];
    const existingEntry = mappings.find(row => row[0] === clientUID);

    if (existingEntry) {
      // Update the existing name for the UID
      const rowIndex = mappings.findIndex(row => row[0] === clientUID) + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `UserMapping!B${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[userName]] },
      });
    } else {
      // Add a new UID-name mapping
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: userMappingSheet,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[clientUID, userName]],
        },
      });
    }

    res.status(200).json({ message: 'Name set successfully!' });
  } catch (error) {
    console.error('Error setting name:', error.message);
    res.status(500).json({ error: 'Failed to set name.' });
  }
});

app.post('/get-username', async (req, res) => {
  try {
    const { clientUID } = req.body;

    // Fetch the UID-to-Username mapping sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'UserMapping!A:B', // Adjust the range for the UIDMapping worksheet
    });

    const rows = response.data.values || [];
    const dataRows = rows.slice(1); // Exclude the header row

    // Find the matching UID
    const matchingRow = dataRows.find((row) => row[0] === clientUID);

    if (matchingRow) {
      // UID exists, return the username
      res.status(200).json({ userName: matchingRow[1] });
    } else {
      // UID does not exist, add a default mapping
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'UserMapping!A:B',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[clientUID, 'Click to Edit Name']],
        },
      });

      res.status(200).json({ userName: 'Click to Edit Name' });
    }
  } catch (error) {
    console.error('Error fetching username:', error.message);
    res.status(500).json({ error: 'Failed to fetch username.' });
  }
});

app.get('/get-rating', async (req, res) => {
  const { clientUID, spotName } = req.query;

  try {
    const sheetData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:I', // Ensure range covers all columns
    });

    const rows = sheetData.data.values || [];
    const dataRows = rows.slice(1); // Skip the header row

    // Find the matching row
    const match = dataRows.find(
      (row) => row[0] === clientUID && row[1] === spotName
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
    console.error('Error fetching ratings:', error.message);
    res.status(500).json({ error: 'Failed to fetch ratings.' });
  }
});


app.get('/get-spots', async (req, res) => {
  const { clientUID } = req.query;

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
      .filter((row) => row[0] === clientUID) // Filter by clientUID
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



// Start the Express Server
// server.js
const PORT = process.env.PORT || 5001;  // Use environment variable, fallback to 5001
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});