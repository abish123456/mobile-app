# Cleanup Debug Files Script
# Removes one-time debug/troubleshooting files

Write-Host "`n=== CLEANING UP DEBUG FILES ===" -ForegroundColor Cyan
Write-Host "`nRemoving debug SQL files..." -ForegroundColor Yellow

# Remove debug SQL files
$sqlFiles = @(
    "CHECK_DATABASE_TOKEN.sql",
    "CHECK_ADMIN_USER.sql",
    "ADD_MISSING_INDEX.sql",
    "CLEAN_MIGRATION_HISTORY.sql"
)

foreach ($file in $sqlFiles) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "  ✓ Removed: $file" -ForegroundColor Green
    }
}

Write-Host "`nRemoving debug markdown files..." -ForegroundColor Yellow

# Remove debug MD files
$debugFiles = @(
    # Migration debug files
    "APPLY_MIGRATION.md",
    "BASELINE_MIGRATION_INSTRUCTIONS.md",
    "MIGRATION_BASELINING_COMPLETE.md",
    "FIX_MIGRATION_HISTORY.md",
    "FIX_DRIFT_DETECTION.md",
    "INDEX_ALREADY_EXISTS_FIX.md",
    "VERIFY_INDEX_FIX.md",
    "CREATE_ADMIN_USER.md",
    
    # Token/Payment debug files
    "CHECK_TOKEN_AFTER_PAYMENT.md",
    "TOKEN_SAVED_SUCCESS.md",
    "TOKEN_SAVING_TROUBLESHOOTING.md",
    "TEST_CARD_PAYMENT_FOR_TOKEN.md",
    "TOKENIZATION_IMPLEMENTATION_COMPLETE.md",
    "PAYMENT_METHOD_USAGE_UPDATE.md",
    "DEBUG_PROFILE_ISSUE.md",
    
    # Razorpay debug files
    "RAZORPAY_500_ERROR_FIX.md",
    "RAZORPAY_ACCOUNT_ISSUE.md",
    "RAZORPAY_CARD_VS_UPI_ISSUE.md",
    "RAZORPAY_DEBUG_CHECKLIST.md",
    "RAZORPAY_ENV_SETUP.md",
    "RAZORPAY_ERROR_ANALYSIS.md",
    "RAZORPAY_ERROR_DEBUGGING.md",
    "RAZORPAY_GATEWAY_ERROR_FIX.md",
    "RAZORPAY_QUICK_FIX.md",
    "RAZORPAY_SAVE_CARDS_LOCATION.md",
    "RAZORPAY_SAVED_CARDS_NOT_FOUND.md",
    "RAZORPAY_TEST_CARDS_GUIDE.md",
    "RAZORPAY_TOKEN_WORKAROUND.md",
    "RAZORPAY_TOKENIZATION_GUIDE.md",
    "ENABLE_CARD_PAYMENTS_RAZORPAY.md",
    
    # Stripe files (no longer used)
    "STRIPE_CARD_DATA_WARNING.md",
    "STRIPE_SETUP.md",
    "STRIPE_TESTING_AND_VERIFICATION.md",
    "STRIPE_WEBHOOK_LOCAL_SETUP.md",
    "TESTING_STRIPE_WEBHOOK.md",
    "PAYMENT_INTENTS_IMPLEMENTATION.md",
    "PAYMENT_METHOD_VERIFICATION_EXPLAINED.md",
    "PAYMENT_METHOD_VERIFICATION.md",
    "TESTING_CARD_VERIFICATION.md",
    
    # Other debug files
    "PAYMENT_UI_IMPROVEMENTS.md",
    "PAYMENT_WORKFLOW_RECOMMENDATIONS.md",
    "DASHBOARD_UI_RECOMMENDATIONS.md"
)

$removedCount = 0
foreach ($file in $debugFiles) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "  ✓ Removed: $file" -ForegroundColor Green
        $removedCount++
    }
}

Write-Host "`n✅ Cleanup complete!" -ForegroundColor Green
Write-Host "  Removed $removedCount debug files" -ForegroundColor White
Write-Host "`n📝 Files kept:" -ForegroundColor Cyan
Write-Host "  - README.md" -ForegroundColor White
Write-Host "  - NEXT_STEPS.md" -ForegroundColor White
Write-Host "  - Core setup guides" -ForegroundColor White
Write-Host "  - Admin documentation" -ForegroundColor White
Write-Host "  - Implementation plans" -ForegroundColor White

