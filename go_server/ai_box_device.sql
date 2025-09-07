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

 Date: 29/08/2025 15:27:13
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for ai_box_device
-- ----------------------------
DROP TABLE IF EXISTS `ai_box_device`;
CREATE TABLE `ai_box_device` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '云盒子设备ID',
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `dev_uid` varchar(36) NOT NULL COMMENT '设备唯一标识符',
  `dev_code` varchar(50) DEFAULT NULL COMMENT '设备编码',
  `dev_text` varchar(100) DEFAULT '' COMMENT '设备备注文本',
  `vm_sn` varchar(20) DEFAULT '' COMMENT '容器编号',
  `phone_sn` varchar(20) DEFAULT NULL COMMENT '云手机编号',
  `is_online` tinyint(1) DEFAULT '0' COMMENT '是否在线',
  `last_online_time` datetime(3) DEFAULT NULL COMMENT '最后在线时间',
  `country_code` varchar(20) DEFAULT '' COMMENT '国家代码',
  `proxy_id` int(11) NOT NULL COMMENT '代理ID',
  `ai_box_id` int(11) NOT NULL COMMENT '盒子ID',
  `merchant_id` int(11) NOT NULL COMMENT '商户编号',
  `device_group_id` int(11) DEFAULT NULL COMMENT '分组id',
  `custom_code` int(11) DEFAULT NULL COMMENT '自定义编号，数字类型便于排序',
  `dev_name` varchar(64) DEFAULT NULL COMMENT '设备名',
  `dev_ip` varchar(45) DEFAULT '' COMMENT '设备IP地址',
  `is_env_created` int(11) DEFAULT NULL,
  `is_skip_env_reset` int(11) DEFAULT NULL COMMENT '是否可以跳过云机重置',
  PRIMARY KEY (`id`),
  UNIQUE KEY `dev_uid` (`dev_uid`),
  UNIQUE KEY `uk_merchant_custom_code` (`merchant_id`,`custom_code`),
  KEY `idx_dev_code` (`dev_code`)
) ENGINE=InnoDB AUTO_INCREMENT=216 DEFAULT CHARSET=utf8mb4 COMMENT='云盒子设备信息表';

SET FOREIGN_KEY_CHECKS = 1;
