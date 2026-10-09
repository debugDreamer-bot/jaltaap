"""Powertools for AWS Lambda: structured logs, custom metrics (namespace JalTaap) and tracing.

Logs are keyed by user_hash and message_id, never raw phone numbers.
"""
from aws_lambda_powertools import Logger, Metrics, Tracer
from aws_lambda_powertools.metrics import MetricUnit

logger = Logger(service="jaltaap")
metrics = Metrics(namespace="JalTaap", service="jaltaap")
tracer = Tracer(service="jaltaap")

__all__ = ["logger", "metrics", "tracer", "MetricUnit"]
