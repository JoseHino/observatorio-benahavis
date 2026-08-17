# -*- coding: utf-8 -*-
"""Módulos de extracción, uno por fuente.

Cada módulo es idempotente, archiva su descarga cruda en ``data/raw`` con marca
temporal, reintenta con espera creciente y falla de forma explícita y registrada
si la fuente no responde. Ninguno devuelve datos de relleno.
"""
