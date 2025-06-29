const express = require('express');
const { Pool } = require('pg');
const redis = require('redis');
const bodyParser = require('body-parser');
const logger = require('./logger');
const app = express();
const port = 3000;

app.use(bodyParser.json());

const db = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
});

const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
});
redisClient.connect();

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

app.post('/todos', async (req, res) => {
  const { task } = req.body;
  logger.info(`Adding new todo: "${task}"`);
  await db.query('INSERT INTO todos(task) VALUES($1)', [task]);
  await redisClient.del('todos:all');
  res.sendStatus(201);
});

app.listen(port, () => {
  logger.info(`Server running at http://localhost:${port}`);
});
