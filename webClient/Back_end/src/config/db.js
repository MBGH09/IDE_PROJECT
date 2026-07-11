import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config({ override: true });

const sequelize = new Sequelize(
  process.env.DB_NAME || 'collaborative_app',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
  }
);

export default sequelize;
