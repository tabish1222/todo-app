const express = require('express');
const cors = require('cors');
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
const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
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
  try {
    const cacheKey = 'todos:all';
    const cacheData = await redisClient.get(cacheKey);
    if (cacheData) {
      logger.info('Cache hit for /todos');
      return res.json(JSON.parse(cacheData));
    }

    const result = await pool.query('SELECT * FROM todos ORDER BY id DESC');
    await redisClient.set(cacheKey, JSON.stringify(result.rows), { EX: 60 });
    logger.info('Fetched from DB and updated Redis cache for /todos');
    res.json(result.rows);
  } catch (error) {
    logger.error(`Error in GET /todos: ${error.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Add new todo
app.post('/todos', async (req, res) => {
  try {
    const { task } = req.body;
    logger.info(`Adding new todo: "${task}"`);
    await pool.query('INSERT INTO todos(task) VALUES($1)', [task]);
    await redisClient.del('todos:all');
    res.sendStatus(201);
  } catch (error) {
    logger.error(`Error in POST /todos: ${error.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  logger.info(`Server running at http://localhost:${port} or on Render`);
});
