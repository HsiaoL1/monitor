/*
 Navicat Premium Dump SQL

 Source Server         : ims_pro
 Source Server Type    : MySQL
 Source Server Version : 50744 (5.7.44-log)
 Source Host           : 119.8.54.133:8306
 Source Schema         : ims

 Target Server Type    : MySQL
 Target Server Version : 50744 (5.7.44-log)
 File Encoding         : 65001

 Date: 13/11/2025 20:31:30
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for device_app_version
-- ----------------------------
DROP TABLE IF EXISTS `device_app_version`;
CREATE TABLE `device_app_version` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `device_type` int(11) NOT NULL COMMENT '1盒子，2百度云机',
  `dev_code` varchar(100) NOT NULL DEFAULT '' COMMENT '设备编码',
  `type` int(11) DEFAULT NULL COMMENT 'app类型，1 whatsapp个人，2 whatsapp商业，3 whatsapp个人插件，4 whatsapp商业插件',
  `version` varchar(50) DEFAULT NULL COMMENT '版本号',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `device_app_version_dev_code_index` (`dev_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='设备上应用的版本号，插件的版本号';

SET FOREIGN_KEY_CHECKS = 1;
