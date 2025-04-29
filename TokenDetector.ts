import { Connection, PublicKey, ConfirmedSignatureInfo } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { WebhookServer } from './WebhookServer';
import { TokenValidator } from './TokenValidator';
import { TradingEngine } from './TradingEngine';

export class TokenDetector {
  private connection: Connection;
  private webhookServer: WebhookServer;
  private tokenValidator: TokenValidator;
  private tradingEngine: TradingEngine;
  private isRunning: boolean = false;
  
  // Store recently processed signatures to avoid duplicates
  private processedSignatures: Set = new Set();
  
  constructor(
    rpcUrl: string,
    webhookPort: number,
    private onTokenDetected: (tokenMint: string, tokenInfo: any) => void
  ) {
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.webhookServer = new WebhookServer(webhookPort, this.handleWebhookEvent.bind(this));
    this.tokenValidator = new TokenValidator(this.connection);
    this.tradingEngine = new TradingEngine();
  }
  
  public async start(): Promise {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('Starting token detector...');
    
    // Start the webhook server to receive Helius notifications
    await this.webhookServer.start();
    
    // Also start direct blockchain monitoring as a backup method
    this.startBlockchainMonitoring();
  }
  
  public async stop(): Promise {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    console.log('Stopping token detector...');
    
    await this.webhookServer.stop();
  }
  
  private async handleWebhookEvent(event: any): Promise {
    try {
      if (event.type !== 'TOKEN_MINT') return;
      
      const tokenMint = event.tokenMint;
      
      // Avoid processing duplicates
      if (this.processedSignatures.has(event.signature)) return;
      this.processedSignatures.add(event.signature);
      
      console.log(`Webhook detected new token: ${tokenMint}`);
      
      // Get token information
      const tokenInfo = await this.getTokenInfo(tokenMint);
      
      // Validate the token
      const isValid = await this.tokenValidator.validate(tokenMint, tokenInfo);
      
      if (isValid) {
        // Notify and potentially trade
        this.onTokenDetected(tokenMint, tokenInfo);
        
        // Execute trade if auto-trading is enabled
        if (this.tradingEngine.isAutoTradingEnabled()) {
          await this.tradingEngine.executeTrade(tokenMint, tokenInfo);
        }
      }
    } catch (error) {
      console.error('Error handling webhook event:', error);
    }
  }
  
  private async startBlockchainMonitoring(): Promise {
    if (!this.isRunning) return;
    
    try {
      // Look for recent signatures that interact with the Token Program
      const signatures = await this.connection.getSignaturesForAddress(
        new PublicKey(TOKEN_PROGRAM_ID),
        { limit: 10 }
      );
      
      // Process each signature
      for (const signatureInfo of signatures) {
        await this.processSignature(signatureInfo);
      }
      
      // Schedule next check
      setTimeout(() => this.startBlockchainMonitoring(), 1000);
    } catch (error) {
      console.error('Error monitoring blockchain:', error);
      // Retry after a delay
      setTimeout(() => this.startBlockchainMonitoring(), 5000);
    }
  }
  
  private async processSignature(signatureInfo: ConfirmedSignatureInfo): Promise {
    const signature = signatureInfo.signature;
    
    // Skip if already processed
    if (this.processedSignatures.has(signature)) return;
    this.processedSignatures.add(signature);
    
    try {
      // Get transaction details
      const transaction = await this.connection.getParsedTransaction(signature, 'confirmed');
      if (!transaction) return;
      
      // Look for token initialization instructions
      for (const instruction of transaction.transaction.message.instructions) {
        if (
          instruction.programId.toString() === TOKEN_PROGRAM_ID.toString() &&
          'parsed' in instruction &&
          instruction.parsed.type === 'initializeMint'
        ) {
          const tokenMint = instruction.parsed.info.mint;
          console.log(`Direct monitoring detected new token: ${tokenMint}`);
          
          // Get token information
          const tokenInfo = await this.getTokenInfo(tokenMint);
          
          // Validate the token
          const isValid = await this.tokenValidator.validate(tokenMint, tokenInfo);
          
          if (isValid) {
            // Notify and potentially trade
            this.onTokenDetected(tokenMint, tokenInfo);
            
            // Execute trade if auto-trading is enabled
            if (this.tradingEngine.isAutoTradingEnabled()) {
              await this.tradingEngine.executeTrade(tokenMint, tokenInfo);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error processing signature ${signature}:`, error);
    }
  }
  
  private async getTokenInfo(tokenMint: string): Promise {
    try {
      // Get token account info
      const tokenPublicKey = new PublicKey(tokenMint);
      const tokenInfo = await this.connection.getParsedAccountInfo(tokenPublicKey);
      
      // Additional metadata could be fetched from Helius DAS API or other sources
      
      return tokenInfo;
    } catch (error) {
      console.error(`Error getting token info for ${tokenMint}:`, error);
      return null;
    }
  }
  
  // Clean up old processed signatures to prevent memory leaks
  private cleanupProcessedSignatures(): void {
    if (this.processedSignatures.size > 1000) {
      // Convert to array, take the 500 most recent, and convert back to Set
      const signaturesArray = Array.from(this.processedSignatures);
      this.processedSignatures = new Set(signaturesArray.slice(-500));
    }
  }
}
