const express = require('express');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const fs = require('fs-extra');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const path = require('path')

const modelsPath = path.join(__dirname, 'public', process.env.API_PATH || '', 'models')

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(modelsPath, req.body.id);
    fs.ensureDirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage: storage });

const app = express();

const port = 5000;

console.log({ modelsPath });


app.use(cors());
//app.use(express.urlencoded({ extended: true })); //Parse URL-encoded bodies
app.use(express.json()); // Used to parse JSON bodies
app.use(express.static('public'));

const degreesToRads = (deg) => (deg * Math.PI) / 180.0;

const sumOfAnglesRad = (angle1, angle2) => {
  const sumRad = angle1 + angle2;
  //return sumRad % (2 * Math.PI);
  return sumRad;
};

const router = express.Router();
app.use(process.env.API_PATH || '/', router);

(async () => {
  await fs.ensureDir('./db');
  await fs.ensureDir(modelsPath);

  // Initialize SQLite database
  const db = await open({
    filename: './db/database.sqlite',
    driver: sqlite3.Database,
  });
  // Create a table
  await db.exec(
    'CREATE TABLE IF NOT EXISTS object (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, type TEXT, path TEXT, rotateAxis TEXT, rotateDeg REAL, settings TEXT)'
  );

  // Define a route to fetch data from the database
  router.get('/objects', async (req, res) => {
    const rows = await db.all('SELECT * FROM object');
    const data = rows.map((row) => {
      const settings = JSON.parse(row.settings);
      return { ...row, settings };
    });
    res.json(data);
  });

  router.get('/objects/rotation', async (req, res) => {
    try {
      const rows = await db.all('SELECT * FROM object');
      const data = [];

      for (const row of rows) {
        const { id, rotateAxis, rotateDeg } = row;
        const settings = JSON.parse(row.settings);
        const currentRotate = settings.rot[rotateAxis];
        let grad = rotateDeg;
        if (grad < 0) {
          grad = Math.floor(Math.random() * 45) + 1;
        }

        const newRotate = sumOfAnglesRad(currentRotate, degreesToRads(grad));
        settings.rot[rotateAxis] = newRotate;

        await db.run('UPDATE object SET settings = ? WHERE id = ?', [JSON.stringify(settings), id]);
        data.push({ id, rotateAxis, rotateDeg: newRotate, ...settings.rot });
      }

      res.json(data);
    } catch (error) {
      res.json([]);
    }
  });

  // Define a route to add an object to the database
  router.post('/object', async (req, res) => {
    const settings = req.body;
    const settingsStr = JSON.stringify(settings);

    try {
      const rotateValues = [10, 30, -1];
      const rotateAxis = ['x', 'y', 'z'];

      const result = await db.run(
        'INSERT INTO object (name, type, path, settings) VALUES (?, ?, ?, ?)',
        ['', settings.type, '', settingsStr]
      );
      const id = result.lastID;
      const index = (id - 1) % 3;
      const randIndex = Math.floor(Math.random() * 3);

      await db.run('UPDATE object SET rotateAxis = ?, rotateDeg = ? WHERE id = ?', [
        rotateAxis[index],
        rotateValues[index],
        id,
      ]);

      res.status(201).json({
        message: 'Object added successfully',
        id: result.lastID,
        rotateAxis: rotateAxis[randIndex],
        rotateDeg: rotateValues[index],
      });
    } catch (err) {
      console.log({ err });
      res.status(500).send('Error adding object');
    }
  });

  router.post('/object/model', upload.single('file'), async (req, res) => {
    console.log({ body: req.body, file: req.file });

    const id = parseInt(req.body.id);

    await db.run('UPDATE object SET path = ? WHERE id = ?', [
      `/models/${id}/${req.file.filename}`,
      req.body.id,
    ]);

    res.status(201).json({ message: 'Model added successfully' });
  });

  router.post('/objects/reset', async (req, res) => {

    await db.run('DELETE FROM object');
    await db.run('DELETE FROM sqlite_sequence WHERE name = "object"');
    await fs.emptyDir(modelsPath);

    res.status(200).json({ message: 'Reset successfully' });
  });

  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });

  // Close the database connection when the process ends
  await process.on('SIGINT', () => {
    db.close();
    process.exit();
  });
})();
