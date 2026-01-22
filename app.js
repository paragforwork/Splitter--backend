const express = require('express');
const app = express();
const dotenv = require('dotenv');
dotenv.config();
const cors = require('cors');
const connectDB = require('./config/db.js');
const authRoutes = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');
app.use(cors());
app.use(express.json());


connectDB();


app.get('/', (req, res) => {
  res.send('Hello, World!');
});

app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);

module.exports = app;
