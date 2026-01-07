const mongoose = require("mongoose")
require("dotenv").config()

const mongoUri = process.env.MONGODB;

const initializeDatabase = async () => {
  await mongoose
    .connect(mongoUri)
    .then(() => {
      console.log('Connected to the database.');
    })
    .catch((error) => {
      console.log('Error connecting the database.', error);
    });
};

module.exports = {initializeDatabase}