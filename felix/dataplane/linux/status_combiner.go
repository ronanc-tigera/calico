// Copyright (c) 2016-2017,2020 Tigera, Inc. All rights reserved.
//
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

package intdataplane

import (
	log "github.com/sirupsen/logrus"

	"github.com/projectcalico/calico/felix/proto"
	"github.com/projectcalico/calico/felix/types"
	"github.com/projectcalico/calico/libcalico-go/lib/set"
)

// endpointStatusCombiner combines the status reports of endpoints from the IPv4 and IPv6
// endpoint managers.  Where conflicts occur, it reports the "worse" status.
type endpointStatusCombiner struct {
	ipVersionToStatuses map[uint8]map[interface{}]string
	dirtyIDs            set.Set[any] /* FIXME HEP or WEP ID */
	fromDataplane       chan interface{}
	activeWlEndpoints   map[types.WorkloadEndpointID]*proto.WorkloadEndpoint
}

func newEndpointStatusCombiner(fromDataplane chan interface{}, ipv6Enabled bool) *endpointStatusCombiner {
	e := &endpointStatusCombiner{
		ipVersionToStatuses: map[uint8]map[interface{}]string{},
		dirtyIDs:            set.New[any](),
		fromDataplane:       fromDataplane,
		activeWlEndpoints:   map[types.WorkloadEndpointID]*proto.WorkloadEndpoint{},
	}

	// IPv4 is always enabled.
	e.ipVersionToStatuses[4] = map[interface{}]string{}
	if ipv6Enabled {
		// If IPv6 is enabled, track the IPv6 state too.  We use the presence of this
		// extra map to trigger merging.
		e.ipVersionToStatuses[6] = map[interface{}]string{}
	}
	return e
}

func (e *endpointStatusCombiner) OnEndpointStatusUpdate(
	ipVersion uint8,
	id interface{}, // types.HostEndpointID or types.WorkloadEndpointID
	status string,
	extraInfo interface{}, // WorkloadEndpoint or nil
) {
	log.WithFields(log.Fields{
		"ipVersion": ipVersion,
		"workload":  id,
		"status":    status,
	}).Info("Storing endpoint status update")
	e.dirtyIDs.Add(id)
	if status == "" {
		delete(e.ipVersionToStatuses[ipVersion], id)
		if id, ok := id.(types.WorkloadEndpointID); ok {
			delete(e.activeWlEndpoints, id)
		}
	} else {
		if id, ok := id.(types.WorkloadEndpointID); ok {
			if extraInfo == nil {
				log.Error("Missing workload endpoint data on endpoint status update")
				return
			}
			e.activeWlEndpoints[id] = extraInfo.(*proto.WorkloadEndpoint)
		}
		e.ipVersionToStatuses[ipVersion][id] = status
	}
}

func (e *endpointStatusCombiner) Apply() {
	e.dirtyIDs.Iter(func(id interface{}) error {
		statusToReport := ""
		logCxt := log.WithField("id", id)
		for ipVer, statuses := range e.ipVersionToStatuses {
			status := statuses[id]
			logCxt := logCxt.WithField("ipVersion", ipVer).WithField("status", status)
			if status == "error" {
				logCxt.Info("Endpoint is in error, will report error")
				statusToReport = "error"
			} else if status == "down" && statusToReport != "error" {
				logCxt.Info("Endpoint down for at least one IP version")
				statusToReport = "down"
			} else if status == "up" && statusToReport == "" {
				logCxt.Info("Endpoint up for at least one IP version")
				statusToReport = "up"
			}
		}
		if statusToReport == "" {
			logCxt.Info("Reporting endpoint removed.")
			switch id := id.(type) {
			case types.WorkloadEndpointID:
				protoID := types.WorkloadEndpointIDToProto(id)
				e.fromDataplane <- &proto.WorkloadEndpointStatusRemove{
					Id: protoID,
				}
			case types.HostEndpointID:
				protoID := types.HostEndpointIDToProto(id)
				e.fromDataplane <- &proto.HostEndpointStatusRemove{
					Id: protoID,
				}
			}
		} else {
			logCxt.WithField("status", statusToReport).Info("Reporting combined status.")
			switch id := id.(type) {
			case types.WorkloadEndpointID:
				protoID := types.WorkloadEndpointIDToProto(id)
				e.fromDataplane <- &proto.WorkloadEndpointStatusUpdate{
					Id: protoID,
					Status: &proto.EndpointStatus{
						Status: statusToReport,
					},
					Endpoint: e.activeWlEndpoints[id],
				}
			case types.HostEndpointID:
				protoID := types.HostEndpointIDToProto(id)
				e.fromDataplane <- &proto.HostEndpointStatusUpdate{
					Id: protoID,
					Status: &proto.EndpointStatus{
						Status: statusToReport,
					},
				}
			}
		}
		return set.RemoveItem
	})
}
