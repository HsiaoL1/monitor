CREATE TABLE `browser_servers` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `name` varchar(191) NOT NULL COMMENT '服务器名称,唯一',
  `max_browser_count` int(11) NOT NULL DEFAULT '0' COMMENT '最大浏览器数',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_browser_servers_name` (`name`),
  KEY `idx_browser_servers_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='浏览器服务器列表';
