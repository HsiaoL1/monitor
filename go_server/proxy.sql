/*
 Navicat Premium Dump SQL

 Source Server         : im_test
 Source Server Type    : MySQL
 Source Server Version : 50738 (5.7.38-log)
 Source Host           : 47.242.170.252:8306
 Source Schema         : im_test

 Target Server Type    : MySQL
 Target Server Version : 50738 (5.7.38-log)
 File Encoding         : 65001

 Date: 29/08/2025 15:27:54
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for proxy
-- ----------------------------
DROP TABLE IF EXISTS `proxy`;
CREATE TABLE `proxy` (
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `country_code` varchar(255) DEFAULT NULL,
  `ip` varchar(255) DEFAULT NULL,
  `port` varchar(255) DEFAULT NULL,
  `account` varchar(255) DEFAULT NULL,
  `protocol` varchar(255) DEFAULT NULL,
  `proxy_type` varchar(255) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `status` tinyint(4) DEFAULT NULL,
  `device_id` varchar(255) DEFAULT NULL,
  `device_type` tinyint(4) DEFAULT NULL,
  `dev_code` varchar(255) NOT NULL DEFAULT '' COMMENT '云机编号',
  `merchant_id` int(11) DEFAULT NULL,
  `custom_code` int(11) DEFAULT NULL COMMENT '自定义编号，数字类型便于排序',
  `proxy_text` varchar(255) DEFAULT NULL COMMENT '代理备注',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `uk_merchant_custom_code` (`merchant_id`,`custom_code`)
) ENGINE=InnoDB AUTO_INCREMENT=3226 DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

SET FOREIGN_KEY_CHECKS = 1;
