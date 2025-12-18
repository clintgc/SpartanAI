import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class SnsTopics extends Construct {
  public readonly highThreatTopic: sns.Topic;
  public readonly mediumThreatTopic: sns.Topic;
  public readonly webhookTopic: sns.Topic;
  public readonly consentUpdateTopic: sns.Topic;

  // Dead letter queues for failed message processing
  public readonly highThreatDlq: sqs.Queue;
  public readonly mediumThreatDlq: sqs.Queue;
  public readonly webhookDlq: sqs.Queue;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Dead letter queues
    this.highThreatDlq = new sqs.Queue(this, 'HighThreatDlq', {
      queueName: 'spartan-ai-high-threat-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    this.mediumThreatDlq = new sqs.Queue(this, 'MediumThreatDlq', {
      queueName: 'spartan-ai-medium-threat-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    this.webhookDlq = new sqs.Queue(this, 'WebhookDlq', {
      queueName: 'spartan-ai-webhook-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    // High threat topic (>89% matches) - triggers SMS, FCM, webhooks
    this.highThreatTopic = new sns.Topic(this, 'HighThreatTopic', {
      topicName: 'spartan-ai-high-threat-alerts',
      displayName: 'Spartan AI High Threat Alerts',
    });

    // Medium threat topic (75-89% matches) - triggers FCM only
    this.mediumThreatTopic = new sns.Topic(this, 'MediumThreatTopic', {
      topicName: 'spartan-ai-medium-threat-alerts',
      displayName: 'Spartan AI Medium Threat Alerts',
    });

    // Webhook topic - triggers webhook dispatcher
    this.webhookTopic = new sns.Topic(this, 'WebhookTopic', {
      topicName: 'spartan-ai-webhook-notifications',
      displayName: 'Spartan AI Webhook Notifications',
    });

    // Consent update topic - for integrator hooks
    this.consentUpdateTopic = new sns.Topic(this, 'ConsentUpdateTopic', {
      topicName: 'spartan-ai-consent-updates',
      displayName: 'Spartan AI Consent Updates',
    });
  }
}

