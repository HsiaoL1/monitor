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

 Date: 13/11/2025 19:52:50
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
  `rental_end_time` datetime(3) DEFAULT NULL COMMENT '到期时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_dev_code` (`dev_code`),
  UNIQUE KEY `uk_merchant_custom_code` (`merchant_id`,`custom_code`)
) ENGINE=InnoDB AUTO_INCREMENT=13032 DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
