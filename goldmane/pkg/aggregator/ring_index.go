// Copyright (c) 2025 Tigera, Inc. All rights reserved.

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//	http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package aggregator

import (
	"fmt"
	"sort"

	"github.com/sirupsen/logrus"

	"github.com/projectcalico/calico/goldmane/pkg/internal/types"
	"github.com/projectcalico/calico/libcalico-go/lib/set"
)

// logAggregator is an interface for retrieving flows from an aggregator implementation. This internal interface makes
// swapping out the implementation possible, which is particularly useful for unit testing (but in general is a useful
// property).
type logAggregator interface {
	flowSet(startGt, startLt int64) set.Set[types.FlowKey]
	diachronicFlow(key types.FlowKey) *types.DiachronicFlow
}

func NewRingIndex(a logAggregator) *RingIndex {
	return &RingIndex{
		agg: a,
	}
}

// RingIndex implements the Index interface using a ring of aggregation buckets.
type RingIndex struct {
	agg logAggregator
}

func (a *RingIndex) List(opts IndexFindOpts) ([]*types.Flow, types.ListMeta) {
	logrus.WithFields(logrus.Fields{
		"opts": opts,
	}).Debug("Listing flows from time sorted index")

	// Default to time-sorted flow data.
	// Collect all the flow keys across all buckets that match the request. We will then
	// use DiachronicFlow data to combine statistics together for each key across the time range.
	keys := a.agg.flowSet(opts.startTimeGt, opts.startTimeLt)

	// Aggregate the relevant DiachronicFlows across the time range.
	flowsByKey := map[types.FlowKey]*types.Flow{}
	keys.Iter(func(key types.FlowKey) error {
		d := a.agg.diachronicFlow(key)
		if d == nil {
			// This should never happen, as we should have a DiachronicFlow for every key.
			// If we don't, it's a bug. Return an error, which will trigger a panic.
			return fmt.Errorf("no DiachronicFlow for key %v", key)
		}
		logrus.WithFields(logrus.Fields{
			"key":    key,
			"filter": opts.filter,
		}).Debug("Checking if flow matches filter")
		if d.Matches(opts.filter, opts.startTimeGt, opts.startTimeLt) {
			logrus.WithFields(logrus.Fields{
				"key": key,
			}).Debug("Flow matches filter")
			flow := d.Aggregate(opts.startTimeGt, opts.startTimeLt)
			if flow != nil {
				logrus.WithFields(logrus.Fields{
					"flow": flow,
				}).Debug("Aggregated flow")
				flowsByKey[*flow.Key] = flow
			}
		}
		return nil
	})

	// Convert the map to a slice.
	flows := []*types.Flow{}
	for _, flow := range flowsByKey {
		flows = append(flows, flow)
	}

	// Sort the flows by start time, sorting newer flows first.
	sort.Slice(flows, func(i, j int) bool {
		return flows[i].StartTime > flows[j].StartTime
	})

	// Assign the total before the result is trimmed to match the page size and start page.
	totalFlows := len(flows)

	// If pagination was requested, apply it now after sorting.
	// This is a bit inneficient - we collect more data than we need to return -
	// but it's a simple way to implement basic pagination.
	if opts.pageSize > 0 {
		startIdx := (opts.page) * opts.pageSize
		endIdx := startIdx + opts.pageSize
		if startIdx >= int64(len(flows)) {
			return nil, types.ListMeta{}
		}
		if endIdx > int64(len(flows)) {
			endIdx = int64(len(flows))
		}
		logrus.WithFields(logrus.Fields{
			"pageSize":   opts.pageSize,
			"pageNumber": opts.page,
			"startIdx":   startIdx,
			"endIdx":     endIdx,
			"total":      len(flows),
		}).Debug("Returning paginated flows")

		flows = flows[startIdx:endIdx]
	}

	return flows, calculateListMeta(totalFlows, int(opts.pageSize))
}

func (r *RingIndex) Add(d *types.DiachronicFlow) {
}

func (r *RingIndex) Remove(d *types.DiachronicFlow) {
}

func (a *RingIndex) SortValueSet(opts IndexFindOpts) ([]int64, types.ListMeta) {
	panic("SortValueSet is not supported by the ring index")
}

func (a *RingIndex) FilterValueSet(valueFunc func(*types.FlowKey) []string, opts IndexFindOpts) ([]string, types.ListMeta) {
	logrus.WithFields(logrus.Fields{
		"opts": opts,
	}).Debug("Listing flows from time sorted index")

	// Default to time-sorted flow data.
	// Collect all the flow keys across all buckets that match the request. We will then
	// use DiachronicFlow data to combine statistics together for each key across the time range.
	keys := a.agg.flowSet(opts.startTimeGt, opts.startTimeLt)

	// Aggregate the relevant DiachronicFlows across the time range.
	var values []string
	seen := set.New[string]()
	keys.Iter(func(key types.FlowKey) error {
		d := a.agg.diachronicFlow(key)
		if d == nil {
			// This should never happen, as we should have a DiachronicFlow for every key.
			// If we don't, it's a bug. Return an error, which will trigger a panic.
			return fmt.Errorf("no DiachronicFlow for key %v", key)
		}
		logrus.WithFields(logrus.Fields{
			"key":    key,
			"filter": opts.filter,
		}).Debug("Checking if flow matches filter")
		if d.Matches(opts.filter, opts.startTimeGt, opts.startTimeLt) {
			logrus.WithFields(logrus.Fields{
				"key": key,
			}).Debug("Flow matches filter")
			flow := d.Aggregate(opts.startTimeGt, opts.startTimeLt)
			if flow != nil {
				logrus.WithFields(logrus.Fields{
					"flow": flow,
				}).Debug("Aggregated flow")
				vals := valueFunc(flow.Key)
				for _, val := range vals {
					if !seen.Contains(val) {
						seen.Add(val)
						values = append(values, val)
					}
				}
			}
		}
		return nil
	})

	// Sort the values alphanumerically.
	sort.Strings(values)

	// Assign the total before the result is trimmed to match the page size and start page.
	totalFlows := len(values)

	// If pagination was requested, apply it now after sorting.
	// This is a bit inneficient - we collect more data than we need to return -
	// but it's a simple way to implement basic pagination.
	if opts.pageSize > 0 {
		startIdx := (opts.page) * opts.pageSize
		endIdx := startIdx + opts.pageSize
		if startIdx >= int64(len(values)) {
			return nil, types.ListMeta{}
		}
		if endIdx > int64(len(values)) {
			endIdx = int64(len(values))
		}
		logrus.WithFields(logrus.Fields{
			"pageSize":   opts.pageSize,
			"pageNumber": opts.page,
			"startIdx":   startIdx,
			"endIdx":     endIdx,
			"total":      len(values),
		}).Debug("Returning paginated flows")

		values = values[startIdx:endIdx]
	}

	return values, calculateListMeta(totalFlows, int(opts.pageSize))
}
