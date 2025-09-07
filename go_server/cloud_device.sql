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

 Date: 29/08/2025 15:27:24
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for cloud_device
-- ----------------------------
DROP TABLE IF EXISTS `cloud_device`;
CREATE TABLE `cloud_device` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `data_center_id` int(11) NOT NULL COMMENT '机房编号',
  `dev_code` varchar(255) NOT NULL DEFAULT '' COMMENT '云机编号',
  `dev_text` varchar(255) NOT NULL DEFAULT '' COMMENT '云机备注',
  `is_online` int(11) NOT NULL DEFAULT '1' COMMENT '在线状态,0下线，1在线，2初始化中，3上线中',
  `proxy_id` int(11) NOT NULL DEFAULT '0' COMMENT '代理ID',
  `merchant_id` int(11) NOT NULL DEFAULT '0' COMMENT '商户编号',
  `country_code` varchar(255) NOT NULL DEFAULT '',
  `device_group_id` int(11) NOT NULL DEFAULT '0',
  `custom_code` int(11) DEFAULT NULL COMMENT '自定义编号，数字类型便于排序',
  `dev_name` varchar(64) DEFAULT NULL COMMENT '设备名',
  `is_env_created` int(11) DEFAULT NULL,
  `is_skip_env_reset` int(11) DEFAULT NULL COMMENT '是否可以跳过云机重置',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_merchant_custom_code` (`merchant_id`,`custom_code`),
  KEY `idx_dev_code` (`dev_code`)
) ENGINE=InnoDB AUTO_INCREMENT=3245 DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
