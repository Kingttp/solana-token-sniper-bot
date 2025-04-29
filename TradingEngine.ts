import puppeteer, { Browser, Page } from 'puppeteer';
import { TokenInfo } from './types';
import { sleep, formatAmount } from './utils';

export class TradingEngine {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private isInitialized: boolean = false;
  private autoTradeEnabled: boolean = false;
  private tradeAmount: number = 0.1; // Default trade amount in SOL
  private maxSlippage: number = 5; // Default max slippage percentage
  
  // Configuration
  private walletConnected: boolean = false;
  private tradeHistory: any[] = [];
  
  constructor() {}
  
  /**
   * Initialize the trading engine
   */
  public async initialize(): Promise {
    if (this.isInitialized) return;
    
    try {
      // Launch puppeteer browser
      this.browser = await puppeteer.launch({
        headless: 'new', // Use 'new' headless mode
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: { width: 1280, height: 800 }
      });
      
      // Create a new page
      this.page = await this.browser.newPage();
      
      // Navigate to sniper.xyz
      await this.page.goto('https://sniper.xyz', { waitUntil: 'networkidle2' });
      
      // Set initialized flag
      this.isInitialized = true;
      
      console.log('Trading engine initialized');
    } catch (error) {
      console.error('Failed to initialize trading engine:', error);
      throw error;
    }
  }
  
  /**
   * Connect wallet to sniper.xyz
   */
  public async connectWallet(): Promise {
    if (!this.isInitialized || !this.page) {
      await this.initialize();
    }
    
    try {
      // Click the connect wallet button
      await this.page!.waitForSelector('button:contains("Connect Wallet")', { timeout: 5000 });
      await this.page!.click('button:contains("Connect Wallet")');
      
      // Wait for wallet options to appear and select phantom
      await this.page!.waitForSelector('div[role="dialog"]', { timeout: 5000 });
      await this.page!.click('button:contains("Phantom")');
      
      // Wait for wallet connection (this will require user interaction)
      // In a production environment, you would need to handle this interaction
      // through browser extensions or other methods
      
      // For demonstration, we'll just wait and assume connection
      await sleep(5000);
      
      // Check if wallet connected (look for wallet address display)
      const walletConnected = await this.page!.evaluate(() => {
        return document.querySelector('.wallet-address') !== null;
      });
      
      this.walletConnected = walletConnected;
      console.log(`Wallet ${walletConnected ? 'connected' : 'connection failed'}`);
      
      return walletConnected;
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      this.walletConnected = false;
      return false;
    }
  }
  
  /**
   * Execute a trade for a newly detected token
   */
  public async executeTrade(tokenMint: string, tokenInfo: any): Promise {
    if (!this.isInitialized || !this.page) {
      await this.initialize();
    }
    
    if (!this.walletConnected) {
      await this.connectWallet();
      if (!this.walletConnected) return false;
    }
    
    try {
      // Navigate to the token page on sniper.xyz
      await this.page!.goto(`https://sniper.xyz/token/${tokenMint}`, { waitUntil: 'networkidle2' });
      
      // Wait for the buy interface to load
      await this.page!.waitForSelector('input[placeholder="0.0"]', { timeout: 10000 });
      
      // Enter the trade amount
      await this.page!.type('input[placeholder="0.0"]', this.tradeAmount.toString());
      
      // Set slippage if available
      const slippageSelector = 'button:contains("Slippage")';
      const hasSlippageOption = await this.page!.evaluate((selector) => {
        return document.querySelector(selector) !== null;
      }, slippageSelector);
      
      if (hasSlippageOption) {
        await this.page!.click(slippageSelector);
        await this.page!.type('input[placeholder="0.0%"]', this.maxSlippage.toString());
        // Close slippage dialog by clicking outside
        await this.page!.click('body', { offset: { x: 10, y: 10 } });
      }
      
      // Click the buy button
      await this.page!.click('button:contains("Buy")');
      
      // Wait for transaction confirmation
      await this.page!.waitForSelector('div:contains("Transaction confirmed")', { timeout: 30000 });
      
      // Record the trade
      this.tradeHistory.push({
        tokenMint,
        type: 'BUY',
        amount: this.tradeAmount,
        timestamp: new Date().toISOString()
      });
      
      console.log(`Successfully bought ${tokenMint}`);
      return true;
    } catch (error) {
      console.error(`Failed to execute trade for ${tokenMint}:`, error);
      return false;
    }
  }
  
  /**
   * Sell a token position
   */
  public async sellToken(tokenMint: string, sellPercentage: number = 100): Promise {
    if (!this.isInitialized || !this.page) {
      await this.initialize();
    }
    
    if (!this.walletConnected) {
      await this.connectWallet();
      if (!this.walletConnected) return false;
    }
    
    try {
      // Navigate to the token page on sniper.xyz
      await this.page!.goto(`https://sniper.xyz/token/${tokenMint}`, { waitUntil: 'networkidle2' });
      
      // Wait for the sell interface to load
      await this.page!.waitForSelector('button:contains("Sell")', { timeout: 10000 });
      
      // Click the sell button
      await this.page!.click('button:contains("Sell")');
      
      if (sellPercentage < 100) {
        // Set percentage if not selling all
        await this.page!.waitForSelector('input[placeholder="0.0%"]', { timeout: 5000 });
        await this.page!.type('input[placeholder="0.0%"]', sellPercentage.toString());
      } else {
        // Click "Max" if selling all
        await this.page!.click('button:contains("Max")');
      }
      
      // Confirm sell
      await this.page!.click('button:contains("Confirm Sell")');
      
      // Wait for transaction confirmation
      await this.page!.waitForSelector('div:contains("Transaction confirmed")', { timeout: 30000 });
      
      // Record the trade
      this.tradeHistory.push({
        tokenMint,
        type: 'SELL',
        sellPercentage,
        timestamp: new Date().toISOString()
      });
      
      console.log(`Successfully sold ${tokenMint}`);
      return true;
    } catch (error) {
      console.error(`Failed to sell token ${tokenMint}:`, error);
      return false;
    }
  }
  
  /**
   * Set trade configuration
   */
  public setTradeConfig(config: { 
    tradeAmount?: number; 
    maxSlippage?: number;
    autoTradeEnabled?: boolean;
  }): void {
    if (config.tradeAmount !== undefined) {
      this.tradeAmount = config.tradeAmount;
    }
    
    if (config.maxSlippage !== undefined) {
      this.maxSlippage = config.maxSlippage;
    }
    
    if (config.autoTradeEnabled !== undefined) {
      this.autoTradeEnabled = config.autoTradeEnabled;
    }
    
    console.log('Trading configuration updated:', {
      tradeAmount: this.tradeAmount,
      maxSlippage: this.maxSlippage,
      autoTradeEnabled: this.autoTradeEnabled
    });
  }
  
  /**
   * Get trade history
   */
  public getTradeHistory(): any[] {
    return [...this.tradeHistory];
  }
  
  /**
   * Check if auto trading is enabled
   */
  public isAutoTradingEnabled(): boolean {
    return this.autoTradeEnabled;
  }
  
  /**
   * Clean up resources
   */
  public async cleanup(): Promise {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isInitialized = false;
    }
  }
}
