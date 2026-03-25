import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

export interface ContainerJob {
  id: string;
  name: string;
  namespace: string;
  image: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  result?: string;
  createdAt: Date;
  completedAt?: Date;
}

@Injectable()
export class ContainerService {
  private readonly logger = new Logger(ContainerService.name);
  private readonly jobs = new Map<string, ContainerJob>();
  private readonly namespace: string;
  private readonly image: string;

  constructor(private readonly configService: ConfigService) {
    this.namespace = this.configService.get<string>(
      'K8S_NAMESPACE',
      'orchestra',
    );
    this.image = this.configService.get<string>(
      'AGENT_CONTAINER_IMAGE',
      'orchestra/coding-agent:latest',
    );
  }

  async createJob(params: {
    name: string;
    command: string[];
    env: Record<string, string>;
    timeout?: number;
  }): Promise<ContainerJob> {
    const id = randomUUID();
    const jobName = `${params.name}-${id.slice(0, 8)}`;

    this.logger.log(
      `Creating K8s Job ${jobName} in namespace ${this.namespace}`,
    );

    const k8sApiUrl = this.configService.get<string>(
      'K8S_API_URL',
      'https://kubernetes.default.svc',
    );

    const jobManifest = {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: {
        name: jobName,
        namespace: this.namespace,
        labels: {
          app: 'orchestra',
          component: 'coding-agent',
          jobId: id,
        },
      },
      spec: {
        backoffLimit: 0,
        activeDeadlineSeconds: params.timeout
          ? Math.floor(params.timeout / 1000)
          : 3600,
        template: {
          spec: {
            restartPolicy: 'Never',
            containers: [
              {
                name: 'agent',
                image: this.image,
                command: params.command,
                env: Object.entries(params.env).map(([name, value]) => ({
                  name,
                  value,
                })),
                resources: {
                  requests: { cpu: '500m', memory: '1Gi' },
                  limits: { cpu: '2', memory: '4Gi' },
                },
              },
            ],
          },
        },
      },
    };

    try {
      const response = await fetch(
        `${k8sApiUrl}/apis/batch/v1/namespaces/${this.namespace}/jobs`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.configService.get<string>('K8S_TOKEN', '')}`,
          },
          body: JSON.stringify(jobManifest),
        },
      );

      if (!response.ok) {
        throw new Error(`K8s API error: ${response.statusText}`);
      }
    } catch (error: any) {
      this.logger.warn(
        `K8s job creation failed (may not be in cluster): ${error.message}`,
      );
    }

    const job: ContainerJob = {
      id,
      name: jobName,
      namespace: this.namespace,
      image: this.image,
      status: 'pending',
      createdAt: new Date(),
    };

    this.jobs.set(id, job);
    return job;
  }

  async getJobStatus(jobId: string): Promise<ContainerJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const k8sApiUrl = this.configService.get<string>(
      'K8S_API_URL',
      'https://kubernetes.default.svc',
    );

    try {
      const response = await fetch(
        `${k8sApiUrl}/apis/batch/v1/namespaces/${this.namespace}/jobs/${job.name}`,
        {
          headers: {
            Authorization: `Bearer ${this.configService.get<string>('K8S_TOKEN', '')}`,
          },
        },
      );

      if (response.ok) {
        const data = (await response.json()) as any;
        const conditions = data.status?.conditions ?? [];

        if (conditions.some((c: any) => c.type === 'Complete' && c.status === 'True')) {
          job.status = 'succeeded';
          job.completedAt = new Date();
        } else if (conditions.some((c: any) => c.type === 'Failed' && c.status === 'True')) {
          job.status = 'failed';
          job.completedAt = new Date();
        } else if (data.status?.active > 0) {
          job.status = 'running';
        }
      }
    } catch {
      this.logger.warn(`Could not fetch K8s job status for ${job.name}`);
    }

    return { ...job };
  }

  async collectResults(jobId: string): Promise<string> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const k8sApiUrl = this.configService.get<string>(
      'K8S_API_URL',
      'https://kubernetes.default.svc',
    );

    try {
      const podsResponse = await fetch(
        `${k8sApiUrl}/api/v1/namespaces/${this.namespace}/pods?labelSelector=job-name=${job.name}`,
        {
          headers: {
            Authorization: `Bearer ${this.configService.get<string>('K8S_TOKEN', '')}`,
          },
        },
      );

      if (podsResponse.ok) {
        const podsData = (await podsResponse.json()) as any;
        const podName = podsData.items?.[0]?.metadata?.name;

        if (podName) {
          const logsResponse = await fetch(
            `${k8sApiUrl}/api/v1/namespaces/${this.namespace}/pods/${podName}/log`,
            {
              headers: {
                Authorization: `Bearer ${this.configService.get<string>('K8S_TOKEN', '')}`,
              },
            },
          );

          if (logsResponse.ok) {
            return await logsResponse.text();
          }
        }
      }
    } catch {
      this.logger.warn(`Could not collect results for job ${job.name}`);
    }

    return job.result ?? '';
  }

  async deleteJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const k8sApiUrl = this.configService.get<string>(
      'K8S_API_URL',
      'https://kubernetes.default.svc',
    );

    try {
      await fetch(
        `${k8sApiUrl}/apis/batch/v1/namespaces/${this.namespace}/jobs/${job.name}?propagationPolicy=Background`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${this.configService.get<string>('K8S_TOKEN', '')}`,
          },
        },
      );
    } catch {
      this.logger.warn(`Could not delete K8s job ${job.name}`);
    }

    this.jobs.delete(jobId);
  }
}
