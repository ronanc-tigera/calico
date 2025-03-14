// Copyright (c) 2019 Tigera, Inc. All rights reserved.

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package health

import (
	"context"

	log "github.com/sirupsen/logrus"

	dikastesproto "github.com/projectcalico/calico/app-policy/proto"
)

// An implementation of the HealthzServer health check service.
type healthCheckService struct {
	dikastesproto.UnimplementedHealthzServer
	reporter ReadinessReporter
}

// ReadinessReporter is a type that knows how to report its readiness.
type ReadinessReporter interface {
	Readiness() bool
}

func NewHealthCheckService(h ReadinessReporter) *healthCheckService {
	return &healthCheckService{reporter: h}
}

func (h healthCheckService) CheckReadiness(_ context.Context, request *dikastesproto.HealthCheckRequest) (*dikastesproto.HealthCheckResponse, error) {
	r := h.reporter.Readiness()
	log.Debugf("health service: returning readiness %t", r)
	return &dikastesproto.HealthCheckResponse{Healthy: r}, nil
}

func (h healthCheckService) CheckLiveness(_ context.Context, request *dikastesproto.HealthCheckRequest) (*dikastesproto.HealthCheckResponse, error) {
	log.Debugf("health service: checking liveness")
	return &dikastesproto.HealthCheckResponse{Healthy: true}, nil
}
