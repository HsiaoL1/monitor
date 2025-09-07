
实现的代码：

```go
const (
	OnlineHashKey    = "ims_server_ws:online"
	HeartbeatTimeout = 60 * time.Second // 与hub.go中的超时时间保持一致
)

type UserOnlineInfo struct {
	ServerIP               string `json:"server"`
	HTTPPort               string `json:"http_port"`
	Online                 bool   `json:"online"`
	LoginTime              int64  `json:"loginTime"`
	LoginTimeFormatted     string `json:"loginTimeFormatted"`
	HeartbeatTime          int64  `json:"heartbeatTime"`
	HeartbeatTimeFormatted string `json:"heartbeatTimeFormatted"`
	BdClientNo             string `json:"bdClientNo"`
	PlatformId             string `json:"platformId"`
	ThirdApp               string `json:"thirdApp"`
}

type SocialAccount struct {
	ID            int64  `gorm:"column:id" json:"id"`
	MerchantID    int64  `gorm:"column:merchant_id" json:"merchant_id"`
	Account       string `gorm:"column:account" json:"account"`
	AppUniqueID   string `gorm:"column:app_unique_id" json:"app_unique_id"`
	AccountStatus int8   `gorm:"column:account_status" json:"account_status"` // 0:禁用,1:启用
	PlatformID    int64  `gorm:"column:platform_id" json:"platform_id"`
	OnlineStatus  int8   `gorm:"column:online_status" json:"online_status"` // 0:离线,1:在线,2上线中，3下线中
}

type AccountStatusMismatch struct {
	SocialAccount SocialAccount  `json:"social_account"`
	RedisInfo     UserOnlineInfo `json:"redis_info"`
	IsHBTimeOut   bool           `json:"is_hb_time_out"`
	RedisExists   bool           `json:"redis_exists"`
	StatusMatch   bool           `json:"status_match"`
}

// GetStaleAccountsByMerchants 获取异常数据，按商户维度
// 查找指定商户下社媒账号与Redis中在线状态不一致的账号
func GetStaleAccountsByMerchants(merchantIDs []int64) ([]AccountStatusMismatch, error) {
	if len(merchantIDs) == 0 {
		return nil, fmt.Errorf("merchantIDs不能为空")
	}
	// 查询这些商户下的所有社媒账号
	var accounts []SocialAccount
	if err := db.G.Table("social_accounts").Debug().
		Where("merchant_id IN ?", merchantIDs).
		Where("deleted_at IS NULL").
		Select("id, merchant_id, account, app_unique_id, platform_id, online_status, account_status").
		Scan(&accounts).Error; err != nil {
		return nil, err
	}

	var mismatches []AccountStatusMismatch

	for _, account := range accounts {

		// 使用app_unique_id作为Redis中的userKey查询在线状态
		userKey := account.AppUniqueID
		rdb := NewRedisClient(db.RC, context.Background())
		redisData, err := rdb.GetHashFieldString(OnlineHashKey, userKey)

		var mismatch AccountStatusMismatch
		mismatch.SocialAccount = account
		mismatch.RedisExists = (err == nil && redisData != "")

		if mismatch.RedisExists {
			// 解析Redis中的用户信息
			var redisInfo UserOnlineInfo
			if err := json.Unmarshal([]byte(redisData), &redisInfo); err != nil {
				logs.Warn("解析Redis用户数据失败", "userKey", userKey, "error", err)
				mismatch.StatusMatch = false
				mismatch.IsHBTimeOut = false
			} else {
				mismatch.RedisInfo = redisInfo
				// 判断心跳是否超时
				currentTime := time.Now().Unix()
				heartbeatDuration := time.Duration(currentTime-redisInfo.HeartbeatTime) * time.Second
				mismatch.IsHBTimeOut = heartbeatDuration > HeartbeatTimeout

				// 比较在线状态 - 需要转换类型
				// social_accounts.online_status: 0离线,1在线,2上线中,3下线中
				// redis中的online字段为bool类型
				dbOnline := (account.OnlineStatus == 1) // 只有状态为1才认为是在线
				mismatch.StatusMatch = (dbOnline == redisInfo.Online)
			}
		} else {
			// Redis中不存在该用户，如果数据库中状态为在线则为不匹配
			mismatch.StatusMatch = (account.OnlineStatus != 1) // 如果数据库中不是在线状态，则匹配（都是离线）
			mismatch.IsHBTimeOut = false // Redis中不存在，无法判断心跳，设为false
		}

		// 只返回状态不匹配的记录
		if !mismatch.StatusMatch {
			mismatches = append(mismatches, mismatch)
		}
	}

	logs.Info("账号状态检查完成",
		"merchant_count", len(merchantIDs),
		"mismatch_count", len(mismatches))

	return mismatches, nil
}

type RedisClient struct {
	db  *redis.Client
	mu  sync.Mutex
	ctx context.Context
}

func NewRedisClient(db *redis.Client, ctx context.Context) *RedisClient {
	return &RedisClient{
		db:  db,
		ctx: ctx,
	}
}

// GetHashFieldString 从 Hash 中获取指定字段的原始字符串值
func (r *RedisClient) GetHashFieldString(hashKey, field string) (string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// 获取字段值
	value, err := r.db.HGet(r.ctx, hashKey, field).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return "", fmt.Errorf("字段不存在")
		}
		return "", fmt.Errorf("获取 Hash 字段失败: %w", err)
	}

	return value, nil
}

// 通过运营商户id获取运营和资源方的商户id
func GetOperatorAndResourceMerchantIDsByOperator(merchantID int64) ([]int64, error) {
	var operatorAndResourceMerchantIDs []int64
	// 先获取运营商户的上级商户ID（运营方）
	operatorAndResourceMerchantIDs = append(operatorAndResourceMerchantIDs, merchantID) // 添加运营方的商户ID
	// 获取运营方下的资源方
	var resourceMerchantIDs []int64
	err := db.G.Table("merchant").Debug().
		Select("id").
		Where("type = ?", 4).
		Where("creator_merchant_id = ?", merchantID).
		Pluck("id", &resourceMerchantIDs).Error
	if err != nil {
		return operatorAndResourceMerchantIDs, err
	}
	operatorAndResourceMerchantIDs = append(operatorAndResourceMerchantIDs, resourceMerchantIDs...) // 添加资源方的商户ID
	return operatorAndResourceMerchantIDs, nil
}

```
