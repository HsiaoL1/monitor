-- Migration script to add is_enabled field to browser_servers table
-- Run this on existing databases to add the new field

ALTER TABLE `browser_servers` 
ADD COLUMN `is_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用' AFTER `max_browser_count`;
