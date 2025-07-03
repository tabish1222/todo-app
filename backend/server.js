const express = require('express');
const cors = require('cors'); // ← ADD THIS
const { Pool } = require('pg');
const redis = require('redis');
const bodyParser = require('body-parser');
const logger = require('./logger');
const app = express();
const port = 3000;

// Enable CORS for your frontend Render URL
app.use(cors({
  origin: 'https://todo-frontend-x9he.onrender.com', // ← your frontend URL
}));

app.use(bodyParser.json());

// PostgreSQL connection
const db = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
});
console.log('PGHOST:', process.env.PGHOST);
// Redis connection
const redisUrl = process.env.REDIS_URL;
const redisClient = redis.createClient({ url: redisUrl });

(async () => {
  try {
    if (!redisUrl) throw new Error('REDIS_URL is not set');
    await redisClient.connect();
    logger.info('Connected to Redis');
  } catch (err) {
    logger.error(`Redis connection failed: ${err.message}`);
  }
})();

// Get all todos
app.get('/todos', async (req, res) => {
  const cacheKey = 'todos:all';
  const cacheData = await redisClient.get(cacheKey);
  if (cacheData) {
    logger.info('Cache hit for /todos');
    return res.json(JSON.parse(cacheData));
  }

  const result = await db.query('SELECT * FROM todos ORDER BY id DESC');
  await redisClient.set(cacheKey, JSON.stringify(result.rows), { EX: 60 });
  logger.info('Fetched from DB and updated Redis cache for /todos');
  res.json(result.rows);
});

// Add new todo
app.post('/todos', async (req, res) => {
  const { task } = req.body;
  logger.info(`Adding new todo: "${task}"`);
  await db.query('INSERT INTO todos(task) VALUES($1)', [task]);
  await redisClient.del('todos:all');
  res.sendStatus(201);
});

app.listen(port, () => {
  logger.info(`Server running at http://localhost:${port} or on Render`);
});
