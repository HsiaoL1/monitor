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

 Date: 30/08/2025 16:47:53
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for social_accounts
-- ----------------------------
DROP TABLE IF EXISTS `social_accounts`;
CREATE TABLE `social_accounts` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `merchant_id` bigint(11) DEFAULT NULL,
  `account` varchar(100) NOT NULL COMMENT '账号',
  `app_unique_id` varchar(255) NOT NULL COMMENT '插件帐号ID',
  `platform_id` bigint(11) DEFAULT NULL,
  `account_type` int(11) NOT NULL COMMENT '帐号类型 1个人 2商业',
  `nickname` varchar(100) DEFAULT NULL COMMENT '昵称',
  `avatar` varchar(500) DEFAULT NULL,
  `social_account_group_id` bigint(20) DEFAULT NULL COMMENT '归属分组ID',
  `account_status` tinyint(4) NOT NULL DEFAULT '1' COMMENT '账号状态，1正常 2封号 3注销[登出]',
  `banned_time` datetime DEFAULT NULL COMMENT '封号时间',
  `online_status` tinyint(4) DEFAULT '0' COMMENT '在线状态(0:离线,1:在线,2上线中，3下线中)',
  `heart_time` datetime NOT NULL DEFAULT '0001-01-01 00:00:00' COMMENT '心跳时间',
  `device_type` int(11) NOT NULL COMMENT '设备类型 1盒子云机 2百度云机',
  `cloud_device_id` bigint(11) NOT NULL DEFAULT '0' COMMENT '云机ID',
  `dev_code` varchar(50) NOT NULL DEFAULT '' COMMENT '云机编码',
  `country_code` varchar(50) DEFAULT NULL COMMENT '国家/地区',
  `active_time` datetime DEFAULT NULL COMMENT '活跃时间',
  `message_count` int(11) DEFAULT '0' COMMENT '发送数量',
  `source` int(11) NOT NULL COMMENT '来源 1、扫码 2屏幕码 3导入 4云手机在线',
  `is_send_exception` tinyint(1) NOT NULL DEFAULT '0' COMMENT '发送异常，0否，1是',
  `import_code` varchar(100) NOT NULL DEFAULT '' COMMENT '六段导入批次',
  `file_url` varchar(500) NOT NULL DEFAULT '' COMMENT '六段压缩包地址',
  `fans` int(11) DEFAULT '0' COMMENT '粉丝数',
  `views` int(11) DEFAULT '0' COMMENT '播放量',
  `diggs` int(11) DEFAULT '0' COMMENT '点赞量',
  `comments` int(11) DEFAULT '0' COMMENT '评论量',
  `shares` int(11) DEFAULT '0' COMMENT '分享量',
  `part_time_staff_id` bigint(20) DEFAULT '0' COMMENT '账号属于哪一个兼职用户的',
  PRIMARY KEY (`id`),
  KEY `idx_social_accounts_deleted_at` (`deleted_at`),
  KEY `idx_social_accounts_account` (`account`),
  KEY `idx_social_accounts_group_id` (`social_account_group_id`),
  KEY `idx_social_accounts_account_status` (`account_status`),
  KEY `idx_social_accounts_online_status` (`online_status`),
  KEY `idx_social_accounts_channel` (`platform_id`),
  KEY `idx_social_accounts_app_unique_id` (`app_unique_id`),
  KEY `idx_social_accounts_clouddevid_devtype` (`cloud_device_id`,`device_type`)
) ENGINE=InnoDB AUTO_INCREMENT=1611 DEFAULT CHARSET=utf8mb4 COMMENT='社媒账号表';

SET FOREIGN_KEY_CHECKS = 1;
