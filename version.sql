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

 Date: 13/11/2025 20:31:53
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for version
-- ----------------------------
DROP TABLE IF EXISTS `version`;
CREATE TABLE `version` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `whatsapp_person` varchar(50) DEFAULT NULL COMMENT 'whatsapp个人',
  `whatsapp_business` varchar(50) DEFAULT NULL COMMENT 'whatsapp商业',
  `whatsapp_person_plugin` varchar(50) DEFAULT NULL COMMENT 'whatsapp个人插件',
  `whatsapp_business_plugin` varchar(50) DEFAULT NULL COMMENT 'whatsapp商业插件',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='版本表';

SET FOREIGN_KEY_CHECKS = 1;
