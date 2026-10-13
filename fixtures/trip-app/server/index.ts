import express from 'express';
import tripRoutes from './routes/trips';
import lockRoutes from './routes/locks';

const app = express();
app.use(express.json());
app.use(tripRoutes);
app.use(lockRoutes);

app.listen(3000, () => console.log('trip-app listening on 3000'));
