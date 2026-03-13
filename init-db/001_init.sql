-- init-db/001_init.sql
-- Runs once when the postgres container is first created.
-- Creates a separate database for n8n so it doesn't share the recipes DB.

SELECT 'CREATE DATABASE n8n'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'n8n')\gexec
