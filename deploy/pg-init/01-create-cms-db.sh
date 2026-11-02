#!/bin/bash
# 双库初始化（compose 首次起库时执行）：Club-Ops 库由 POSTGRES_DB 创建，此处补 CMS 库
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  SELECT 'CREATE DATABASE yyc3_yy' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'yyc3_yy')\gexec
EOSQL
